package dev.labflow.service;

import com.fasterxml.jackson.databind.*;
import dev.labflow.api.ApiException;
import dev.labflow.evaluation.ClassificationEvaluator;
import dev.labflow.evaluation.EvaluationSupport;
import dev.labflow.importer.DataImporter;
import dev.labflow.importer.ImportRules;
import dev.labflow.repository.WorkspaceRepository;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceService {
  private final WorkspaceRepository db;
  private final ObjectMapper json;
  private final DataImporter importer;

  public WorkspaceService(WorkspaceRepository db, ObjectMapper json, DataImporter importer) {
    this.db = db;
    this.json = json;
    this.importer = importer;
  }

  private String encode(Object o) {
    try {
      return json.writeValueAsString(o);
    } catch (Exception e) {
      throw ApiException.bad("无效 JSON");
    }
  }

  private Object decode(Object o) {
    try {
      return json.readValue(o.toString(), Object.class);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private Map<String, Object> unpack(Map<String, Object> row) {
    var result = new LinkedHashMap<>(row);
    for (String key :
        List.of(
            "config_json",
            "fields_json",
            "rows_json",
            "warnings_json",
            "parse_rules_json",
            "source_meta_json",
            "parameters",
            "metrics")) {
      if (result.containsKey(key)) {
        Object value = result.remove(key);
        result.put(key.replace("_json", ""), value == null ? null : decode(value));
      }
    }
    if (result.get("source_meta") instanceof Map<?, ?> meta
        && "decimal-strings-v1".equals(meta.get("numeric_encoding"))
        && result.get("rows") instanceof List<?> rows
        && result.get("fields") instanceof List<?> fields) {
      Set<String> numeric = new HashSet<>();
      for (var field : fields)
        if (field instanceof Map<?, ?> f && "number".equals(f.get("type")))
          numeric.add(f.get("name").toString());
      for (var entry : rows)
        if (entry instanceof Map<?, ?>) {
          @SuppressWarnings("unchecked")
          var storedRow = (Map<String, Object>) entry;
          for (String name : numeric)
            if (storedRow.get(name) instanceof String value) {
              try {
                storedRow.put(name, json.readValue(value, Number.class));
              } catch (Exception e) {
                throw new IllegalStateException("Invalid stored numeric token", e);
              }
            }
        }
    }
    return result;
  }

  private List<Map<String, Object>> unpackAll(List<Map<String, Object>> list) {
    return list.stream().map(this::unpack).toList();
  }

  public void project(long p) {
    db.one("SELECT id FROM projects WHERE id=?", p);
  }

  public List<Map<String, Object>> projects() {
    return db.query(
        "SELECT p.*, (SELECT COUNT(*) FROM experiments e WHERE e.project_id=p.id)"
            + " experiment_count,(SELECT COUNT(*) FROM charts c WHERE c.project_id=p.id)"
            + " chart_count,(SELECT COUNT(*) FROM datasets d WHERE d.project_id=p.id) dataset_count"
            + " FROM projects p ORDER BY p.id DESC");
  }

  public Map<String, Object> updateProject(
      long p, String name, String description, boolean archived) {
    project(p);
    db.update(
        "UPDATE projects SET name=?,description=?,archived=? WHERE id=?",
        name.trim(),
        description,
        archived,
        p);
    return db.one("SELECT * FROM projects WHERE id=?", p);
  }

  public ImportRules importRules(String value) {
    if (value == null || value.isBlank()) return ImportRules.defaults();
    try {
      var rules = json.readValue(value, ImportRules.class);
      rules.validate();
      return rules;
    } catch (Exception e) {
      throw ApiException.bad("导入规则格式无效：" + e.getMessage());
    }
  }

  public Map<String, Object> preview(long p, String filename, byte[] bytes, ImportRules rules) {
    project(p);
    if (filename == null
        || filename.length() > 255
        || filename.contains("/")
        || filename.contains("\\")
        || filename.contains("\u0000")) throw ApiException.bad("无效文件名");
    DataImporter.Parsed parsed;
    try {
      parsed = importer.parse(filename, bytes, rules);
    } catch (ApiException e) {
      var sheets = importer.sheetNames(filename, bytes);
      var paths = importer.recordPaths(filename, bytes);
      if (sheets.isEmpty() && paths.isEmpty()) throw e;
      return Map.of(
          "filename",
          filename,
          "row_count",
          0,
          "fields",
          List.of(),
          "rows",
          List.of(),
          "warnings",
          List.of(),
          "sheets",
          sheets,
          "record_paths",
          paths,
          "issues",
          List.of(
              Map.of(
                  "row",
                  1,
                  "field",
                  sheets.isEmpty() ? "记录路径" : "工作表",
                  "value",
                  sheets.isEmpty()
                      ? rules.recordsPath()
                      : sheets.get(Math.min(rules.sheet(), sheets.size() - 1)),
                  "message",
                  e.getMessage())),
          "parse_rules",
          rules);
    }
    return Map.of(
        "filename",
        filename,
        "row_count",
        parsed.rows().size(),
        "fields",
        parsed.fields(),
        "rows",
        parsed.rows().stream().limit(20).toList(),
        "warnings",
        parsed.warnings(),
        "sheets",
        parsed.sheets(),
        "record_paths",
        parsed.recordPaths(),
        "issues",
        parsed.issues(),
        "parse_rules",
        rules);
  }

  public Map<String, Object> createProject(String name, String description) {
    long id =
        db.insert("INSERT INTO projects(name,description) VALUES(?,?)", name.trim(), description);
    return db.one("SELECT * FROM projects WHERE id=?", id);
  }

  public List<Map<String, Object>> datasets(long p) {
    project(p);
    return unpackAll(
        db.query(
            "SELECT"
                + " v.id,v.dataset_id,v.version,v.filename,v.sha256,v.row_count,v.fields_json,v.warnings_json,v.parse_rules_json,v.source_meta_json,v.created_at,d.name"
                + " FROM dataset_versions v JOIN datasets d ON d.id=v.dataset_id WHERE"
                + " d.project_id=? ORDER BY v.id DESC",
            p));
  }

  @Transactional
  public Map<String, Object> upload(long p, Long datasetId, String filename, byte[] bytes) {
    return upload(p, datasetId, filename, bytes, ImportRules.defaults());
  }

  @Transactional
  public Map<String, Object> upload(
      long p, Long datasetId, String filename, byte[] bytes, ImportRules rules) {
    project(p);
    if (filename == null
        || filename.length() > 255
        || filename.contains("/")
        || filename.contains("\\")
        || filename.contains("\u0000")) throw ApiException.bad("无效文件名");
    var parsed = importer.parse(filename, bytes, rules);
    if (!parsed.issues().isEmpty()) throw ApiException.bad("存在未解决的解析问题，请先预览并修正导入规则");
    int version = 1;
    if (datasetId == null)
      datasetId = db.insert("INSERT INTO datasets(project_id,name) VALUES(?,?)", p, filename);
    else {
      db.one("SELECT id FROM datasets WHERE id=? AND project_id=? FOR UPDATE", datasetId, p);
      version =
          ((Number)
                  db.one(
                          "SELECT COALESCE(MAX(version),0)+1 n FROM dataset_versions WHERE"
                              + " dataset_id=?",
                          datasetId)
                      .get("n"))
              .intValue();
    }
    String hash;
    try {
      hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
    long id =
        db.insert(
            "INSERT INTO"
                + " dataset_versions(dataset_id,version,filename,sha256,original_file,fields_json,rows_json,warnings_json,row_count,parse_rules_json)"
                + " VALUES(?,?,?,?,?,?,?,?,?,?)",
            datasetId,
            version,
            filename,
            hash,
            bytes,
            encode(parsed.fields()),
            encode(parsed.rows()),
            encode(parsed.warnings()),
            parsed.rows().size(),
            encode(rules));
    return data(p, id);
  }

  public Map<String, Object> data(long p, long id) {
    return unpack(
        db.one(
            "SELECT"
                + " v.id,v.dataset_id,v.version,v.filename,v.sha256,v.row_count,v.fields_json,v.rows_json,v.warnings_json,v.parse_rules_json,v.source_meta_json,v.created_at"
                + " FROM dataset_versions v JOIN datasets d ON d.id=v.dataset_id WHERE v.id=? AND"
                + " d.project_id=?",
            id,
            p));
  }

  /** Bounded column profile for agents: no rows are recomputed, no files are re-read. */
  @SuppressWarnings("unchecked")
  public Map<String, Object> profile(long p, long id) {
    var data = data(p, id);
    var fields = (List<Map<String, Object>>) data.get("fields");
    var rows = (List<Map<String, Object>>) data.get("rows");
    var summarized = new ArrayList<Map<String, Object>>();
    for (var field : fields) {
      if (summarized.size() >= 80) break;
      var item = new LinkedHashMap<String, Object>();
      item.put("name", field.get("name"));
      item.put("type", field.get("type"));
      item.put("role", field.get("role"));
      item.put("suggested_role", field.get("suggestedRole"));
      item.put("missing", field.get("missing"));
      item.put("unique", field.get("unique"));
      item.put("constant", field.get("constant"));
      if (field.containsKey("min")) {
        item.put("min", field.get("min"));
        item.put("max", field.get("max"));
      }
      var samples = new ArrayList<String>();
      for (Object value : (List<Object>) field.get("samples")) {
        String text = String.valueOf(value);
        samples.add(text.length() > 40 ? text.substring(0, 40) : text);
        if (samples.size() == 3) break;
      }
      item.put("samples", samples);
      summarized.add(item);
    }
    var profile = new LinkedHashMap<String, Object>();
    profile.put("dataset_version_id", data.get("id"));
    profile.put("dataset_id", data.get("dataset_id"));
    profile.put("filename", data.get("filename"));
    profile.put("version", data.get("version"));
    profile.put("sha256", data.get("sha256"));
    profile.put("row_count", data.get("row_count"));
    profile.put("fields", summarized);
    profile.put("head", rows.subList(0, Math.min(10, rows.size())));
    profile.put("truncated", Map.of("columns", fields.size() > 80, "rows", rows.size() > 10));
    return profile;
  }

  public Map<String, Object> original(long p, long id) {
    return db.one(
        "SELECT v.filename,v.original_file FROM dataset_versions v JOIN datasets d ON"
            + " d.id=v.dataset_id WHERE v.id=? AND d.project_id=?",
        id,
        p);
  }

  public List<Map<String, Object>> charts(long p) {
    project(p);
    return db.query("SELECT * FROM charts WHERE project_id=? ORDER BY updated_at DESC", p);
  }

  public Map<String, Object> chart(long p, long id) {
    return unpack(
        db.one(
            "SELECT c.*,v.config_json,v.dataset_version_id FROM charts c JOIN chart_versions v ON"
                + " v.chart_id=c.id AND v.version=c.revision WHERE c.id=? AND c.project_id=?",
            id,
            p));
  }

  public List<Map<String, Object>> versions(long p, long id) {
    chart(p, id);
    return unpackAll(
        db.query(
            "SELECT version,config_json,created_at FROM chart_versions WHERE chart_id=? ORDER BY"
                + " version DESC",
            id));
  }

  @Transactional
  public Map<String, Object> saveChart(
      long p, Long id, String name, Integer revision, JsonNode config) {
    project(p);
    validateAndReport(p, config);
    if (id == null) {
      id = db.insert("INSERT INTO charts(project_id,name) VALUES(?,?)", p, name);
      revision = 0;
    }
    if (revision == null) throw ApiException.bad("缺少 revision");
    if (db.update(
            "UPDATE charts SET name=?,revision=revision+1 WHERE id=? AND project_id=? AND"
                + " revision=?",
            name,
            id,
            p,
            revision)
        != 1) throw new ApiException(409, "图表已被更新，请重新打开最新版本后再保存");
    db.insert(
        "INSERT INTO chart_versions(chart_id,dataset_version_id,version,schema_version,config_json)"
            + " VALUES(?,?,?,?,?)",
        id,
        config.path("datasetVersionId").asLong(),
        revision + 1,
        1,
        encode(config));
    return chart(p, id);
  }

  @SuppressWarnings("unchecked")
  Map<String, Object> validateAndReport(long p, JsonNode c) {
    if (c == null || c.path("schema_version").asInt() != 1)
      throw ApiException.bad("不支持的配置 schema_version");
    ConfigValidator.validate(c);
    if (encode(c).length() > 200000) throw ApiException.bad("配置过大");
    var data = data(p, c.path("datasetVersionId").asLong());
    Map<String, Object> report = null;
    var fields = (List<Map<String, Object>>) data.get("fields");
    Set<String> names = new HashSet<>(), numeric = new HashSet<>();
    for (var f : fields) {
      names.add(f.get("name").toString());
      if (f.get("type").equals("number")) numeric.add(f.get("name").toString());
    }
    if (!Set.of("histogram", "ecdf", "roc", "pr", "confusion").contains(c.path("type").asText())
        && !names.contains(c.path("x").asText())) throw ApiException.bad("请选择有效的 X 字段");
    if (!c.path("group").asText("").isEmpty() && !names.contains(c.path("group").asText()))
      throw ApiException.bad("分组字段不存在");
    if (c.path("facet").path("mode").asText().equals("field")
        && !names.contains(c.path("facet").path("field").asText()))
      throw ApiException.bad("分面字段不存在");
    if (!c.path("series").isArray() || c.path("series").isEmpty() || c.path("series").size() > 20)
      throw ApiException.bad("需要 1–20 条序列");
    for (JsonNode s : c.path("series")) {
      boolean labels =
          c.path("type").asText().equals("confusion")
              && c.path("classification").path("input").asText().equals("labels");
      if (!labels && !numeric.contains(s.path("y").asText())) throw ApiException.bad("Y 字段必须为数值列");
      if (labels && s.path("visible").asBoolean() && !names.contains(s.path("prediction").asText()))
        throw ApiException.bad("预测标签列不属于当前数据版本");
      var band = s.path("band");
      if (c.path("type").asText().equals("line") && band.path("enabled").asBoolean()) {
        if (!numeric.contains(c.path("x").asText())
            || !numeric.contains(band.path("lower").asText())
            || !numeric.contains(band.path("upper").asText()))
          throw ApiException.bad("区间带 X 与上下界须引用本数据版本中的数值列");
        for (var row : (List<Map<String, Object>>) data.get("rows")) {
          Object low = row.get(band.path("lower").asText()),
              high = row.get(band.path("upper").asText());
          if (low instanceof Number l
              && high instanceof Number h
              && l.doubleValue() > h.doubleValue()) throw ApiException.bad("区间下界不能大于上界");
        }
      }
      String err = s.path("error").asText("");
      if (!err.isEmpty() && Set.of("line", "bar", "scatter").contains(c.path("type").asText())) {
        if (!numeric.contains(err)) throw ApiException.bad("误差棒必须引用数值字段");
        for (var row : (List<Map<String, Object>>) data.get("rows"))
          if (row.get(err) instanceof Number n && n.doubleValue() < 0)
            throw ApiException.bad("误差值不能为负数");
      }
    }
    if (!c.path("transforms").isArray()) throw ApiException.bad("缺少数据转换步骤");
    for (JsonNode t : c.path("transforms")) {
      if (!t.path("op").asText().equals("filter")
          || !names.contains(t.path("field").asText())
          || !Set.of("eq", "gte", "lte").contains(t.path("operator").asText()))
        throw ApiException.bad("无效过滤步骤");
    }
    if (Set.of("roc", "pr", "confusion").contains(c.path("type").asText())) {
      String identity = c.path("sampling").path("id").asText("");
      if (!identity.isEmpty() && !names.contains(identity))
        throw ApiException.bad("样本 ID 不属于当前数据版本");
      EvaluationSupport.validateIdentity(
          c, EvaluationSupport.filtered(c, (List<Map<String, Object>>) data.get("rows")));
    }
    if (c.path("type").asText().equals("confusion")) {
      if (!names.contains(c.path("classification").path("label").asText()))
        throw ApiException.bad("分类真实标签列不属于当前数据版本");
      report = ClassificationEvaluator.evaluate(c, (List<Map<String, Object>>) data.get("rows"));
      report.put(
          "source",
          Map.of(
              "filename",
              data.get("filename"),
              "version",
              data.get("version"),
              "sha256",
              data.get("sha256")));
    }
    if (Set.of("roc", "pr").contains(c.path("type").asText())) {
      String label = c.path("evaluation").path("label").asText(),
          positive = c.path("evaluation").path("positive").asText();
      if (!names.contains(label)) throw ApiException.bad("真实标签列不属于当前数据版本");
      Set<String> labels = new HashSet<>();
      for (var row : (List<Map<String, Object>>) data.get("rows")) {
        boolean keep = true;
        for (var t : c.path("transforms")) {
          Object value = row.get(t.path("field").asText());
          String target = t.path("value").asText(), op = t.path("operator").asText();
          if (op.equals("eq")) {
            if (!labelValue(value).equals(target)) keep = false;
          } else {
            try {
              double v = Double.parseDouble(String.valueOf(value)),
                  bound = Double.parseDouble(target);
              if (!Double.isFinite(v)
                  || !Double.isFinite(bound)
                  || (op.equals("gte") ? v < bound : v > bound)) keep = false;
            } catch (NumberFormatException ex) {
              keep = false;
            }
          }
        }
        if (keep && row.get(label) != null && !labelValue(row.get(label)).isEmpty())
          labels.add(labelValue(row.get(label)));
      }
      if (labels.size() != 2 || !labels.contains(positive))
        throw ApiException.bad("当前过滤后须恰好有两类标签，并明确指定其中一类为正类");
    }
    if (c.path("type").asText().equals("heatmap")
        && (!names.contains(c.path("heatY").asText())
            || !numeric.contains(c.path("heatZ").asText())))
      throw ApiException.bad("热力图需选择 Y 分类和 Z 数值字段");
    for (String key : List.of("width", "height")) {
      int n = c.path("style").path(key).asInt();
      if (n < 250 || n > 2400) throw ApiException.bad("图表尺寸须为 250–2400 px");
    }
    return report;
  }

  private static String labelValue(Object value) {
    if (value == null) return "null";
    if (value instanceof Number)
      return new java.math.BigDecimal(value.toString()).stripTrailingZeros().toPlainString();
    return value.toString();
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> classificationReport(long p, JsonNode c) {
    if (c == null || !c.path("type").asText().equals("confusion"))
      throw ApiException.bad("分类报告需要混淆矩阵配置");
    return validateAndReport(p, c);
  }
}
