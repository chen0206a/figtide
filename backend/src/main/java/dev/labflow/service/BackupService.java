package dev.labflow.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.WorkspaceRepository;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.util.*;
import java.util.zip.*;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Versioned, bounded archive. Uploaded paths are never extracted to the filesystem. */
@Service
public class BackupService {
  static final int COMPRESSED_LIMIT = 64 * 1024 * 1024, EXPANDED_LIMIT = 96 * 1024 * 1024;
  static final LinkedHashMap<String, List<String>> COLUMNS = new LinkedHashMap<>();

  static {
    COLUMNS.put("datasets", List.of("id", "project_id", "name", "created_at"));
    COLUMNS.put(
        "dataset_versions",
        List.of(
            "id",
            "dataset_id",
            "version",
            "filename",
            "sha256",
            "original_file",
            "fields_json",
            "rows_json",
            "warnings_json",
            "row_count",
            "created_at",
            "parse_rules_json",
            "source_meta_json"));
    COLUMNS.put(
        "experiments",
        List.of(
            "id",
            "project_id",
            "name",
            "parameters",
            "metrics",
            "notes",
            "created_at",
            "updated_at",
            "status",
            "tags_json",
            "revision"));
    COLUMNS.put("experiment_datasets", List.of("experiment_id", "dataset_version_id"));
    COLUMNS.put(
        "charts", List.of("id", "project_id", "name", "revision", "created_at", "updated_at"));
    COLUMNS.put(
        "chart_versions",
        List.of(
            "id",
            "chart_id",
            "dataset_version_id",
            "version",
            "schema_version",
            "config_json",
            "created_at"));
    COLUMNS.put(
        "style_templates",
        List.of("id", "project_id", "name", "schema_version", "profile_json", "created_at"));
  }

  private final WorkspaceRepository db;
  private final ObjectMapper json;
  private final WorkspaceService workspace;

  public BackupService(WorkspaceRepository db, ObjectMapper json, WorkspaceService workspace) {
    this.db = db;
    this.json = json.copy().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);
    this.json.enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    this.json
        .getFactory()
        .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    this.json
        .getFactory()
        .setStreamReadConstraints(
            com.fasterxml.jackson.core.StreamReadConstraints.builder()
                .maxStringLength(EXPANDED_LIMIT)
                .maxNestingDepth(100)
                .build());
    this.workspace = workspace;
  }

  private static void require(boolean valid, String message) {
    if (!valid) throw ApiException.bad("项目备份：" + message);
  }

  private static String hash(byte[] b) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private JsonNode tree(String s) {
    try {
      var value = json.readTree(s);
      require(value != null, "空 JSON 内容");
      return value;
    } catch (Exception e) {
      throw ApiException.bad("项目备份包含无效 JSON");
    }
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public byte[] export(long p) {
    var project = db.one("SELECT * FROM projects WHERE id=?", p);
    var root =
        json.createObjectNode()
            .put("format", "labflow-project-v1")
            .put("created_at", java.time.Instant.now().toString());
    root.set("project", row(project));
    var tables = root.putObject("tables");
    for (String table : COLUMNS.keySet()) {
      String sql =
          switch (table) {
            case "dataset_versions" ->
                "SELECT t.* FROM dataset_versions t JOIN datasets d ON d.id=t.dataset_id WHERE"
                    + " d.project_id=? ORDER BY t.id";
            case "chart_versions" ->
                "SELECT t.* FROM chart_versions t JOIN charts c ON c.id=t.chart_id WHERE"
                    + " c.project_id=? ORDER BY t.id";
            case "experiment_datasets" ->
                "SELECT t.* FROM experiment_datasets t JOIN experiments e ON e.id=t.experiment_id"
                    + " WHERE e.project_id=? ORDER BY t.experiment_id,t.dataset_version_id";
            default -> "SELECT * FROM " + table + " WHERE project_id=? ORDER BY id";
          };
      var array = tables.putArray(table);
      for (var r : db.query(sql, p)) array.add(row(r));
    }
    try {
      byte[] manifest = json.writeValueAsBytes(root);
      require(manifest.length <= EXPANDED_LIMIT - 65, "项目过大，超过 96 MiB 展开上限");
      var bytes = new ByteArrayOutputStream();
      try (var zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
        zip.putNextEntry(new ZipEntry("manifest.json"));
        zip.write(manifest);
        zip.closeEntry();
        zip.putNextEntry(new ZipEntry("sha256.txt"));
        zip.write(hash(manifest).getBytes(StandardCharsets.US_ASCII));
        zip.closeEntry();
      }
      require(bytes.size() <= COMPRESSED_LIMIT, "项目超过 64 MiB 备份上限");
      return bytes.toByteArray();
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  private ObjectNode row(Map<String, Object> values) {
    var result = json.createObjectNode();
    values.forEach(
        (k, v) -> {
          if (v instanceof Timestamp t) result.put(k, t.toInstant().toString());
          else if (v instanceof byte[] b) result.put(k, Base64.getEncoder().encodeToString(b));
          else result.set(k, json.valueToTree(v));
        });
    return result;
  }

  ObjectNode read(byte[] bytes) {
    require(bytes.length > 0 && bytes.length <= COMPRESSED_LIMIT, "压缩文件须在 64 MiB 以内");
    var entries = new HashMap<String, byte[]>();
    int total = 0;
    try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes), StandardCharsets.UTF_8)) {
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        String name = entry.getName();
        require(
            Set.of("manifest.json", "sha256.txt").contains(name)
                && !entry.isDirectory()
                && !entries.containsKey(name),
            "仅允许唯一的 manifest.json 与 sha256.txt 条目");
        var out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int n;
        while ((n = zip.read(buffer)) != -1) {
          total += n;
          require(total <= EXPANDED_LIMIT, "展开内容超过 96 MiB");
          if (name.equals("sha256.txt")) require(out.size() + n <= 64, "无效校验文件");
          out.write(buffer, 0, n);
        }
        entries.put(name, out.toByteArray());
        zip.closeEntry();
      }
    } catch (IOException | IllegalArgumentException e) {
      throw ApiException.bad("无法读取项目备份 ZIP");
    }
    require(entries.size() == 2, "缺少清单或校验文件");
    var manifest = entries.get("manifest.json");
    require(
        hash(manifest).equals(new String(entries.get("sha256.txt"), StandardCharsets.US_ASCII)),
        "内容校验失败，文件已损坏");
    JsonNode node;
    try {
      node = json.readTree(manifest);
    } catch (IOException e) {
      throw ApiException.bad("项目备份清单不是有效 JSON");
    }
    require(
        node != null
            && node.isObject()
            && node.path("format").asText().equals("labflow-project-v1"),
        "不支持的备份格式");
    var root = (ObjectNode) node;
    validate(root);
    return root;
  }

  private Map<String, Set<Long>> identities(JsonNode root) {
    var ids = new HashMap<String, Set<Long>>();
    for (String table : COLUMNS.keySet()) {
      Set<Long> set = new HashSet<>();
      ids.put(table, set);
      for (var r : root.path("tables").path(table))
        if (r.has("id"))
          require(
              r.get("id").isIntegralNumber()
                  && r.get("id").canConvertToLong()
                  && r.get("id").asLong() > 0
                  && set.add(r.get("id").asLong()),
              "重复或无效 ID：" + table);
    }
    return ids;
  }

  private void validate(ObjectNode root) {
    var project = root.path("project");
    require(
        project.isObject()
            && project.path("id").isIntegralNumber()
            && project.path("id").canConvertToLong()
            && project.path("id").asLong() > 0,
        "缺少项目");
    require(
        project.path("name").isTextual()
            && !project.path("name").asText().isBlank()
            && project.path("name").asText().length() <= 120,
        "项目名称无效");
    require(
        project.path("description").isTextual()
            && project.path("description").asText().length() <= 10000,
        "项目简介无效");
    timestamp(project.path("created_at"));
    require(
        root.path("tables").isObject() && root.path("tables").size() == COLUMNS.size(), "数据表集合不匹配");
    for (var table : COLUMNS.entrySet()) {
      var rows = root.path("tables").path(table.getKey());
      require(rows.isArray() && rows.size() <= 10000, "数据表缺失或记录过多：" + table.getKey());
      for (var r : rows) {
        require(r.isObject() && r.size() == table.getValue().size(), "记录字段不匹配：" + table.getKey());
        for (String c : table.getValue()) {
          require(r.has(c), "缺少字段：" + c);
          if (c.endsWith("_json") || Set.of("parameters", "metrics").contains(c)) {
            require(r.get(c).isNull() || r.get(c).isTextual(), "数据库 JSON 须保留原文");
            if (!r.get(c).isNull()) tree(r.get(c).asText());
          }
          if (c.endsWith("_at")) timestamp(r.get(c));
        }
        if (r.has("project_id"))
          require(r.path("project_id").asLong() == project.path("id").asLong(), "包含其他项目的数据");
      }
    }
    var ids = identities(root);
    var unique = new HashSet<String>();
    for (var r : root.path("tables").path("dataset_versions")) {
      foreign(ids, "datasets", r.path("dataset_id").asLong());
      require(
          r.path("version").asInt() > 0
              && unique.add("d:" + r.path("dataset_id") + ":" + r.path("version")),
          "数据版本重复或无效");
      String file = r.path("filename").asText();
      require(
          !file.isBlank()
              && file.length() <= 255
              && !file.contains("/")
              && !file.contains("\\")
              && !file.contains("\0")
              && (file.toLowerCase(Locale.ROOT).endsWith(".csv")
                  || file.toLowerCase(Locale.ROOT).endsWith(".xlsx")),
          "无效原文件名");
      var raw = original(r);
      require(hash(raw).equals(r.path("sha256").asText()), "原始文件内容指纹不匹配");
      var fields = tree(r.path("fields_json").asText());
      var rows = tree(r.path("rows_json").asText());
      require(
          fields.isArray()
              && fields.size() > 0
              && fields.size() <= 100
              && rows.isArray()
              && rows.size() <= 20000
              && rows.size() == r.path("row_count").asInt()
              && (long) rows.size() * fields.size() <= 200000,
          "数据规模或行数无效");
      Set<String> names = new HashSet<>();
      for (var f : fields)
        require(
            f.path("name").isTextual()
                && names.add(f.path("name").asText())
                && Set.of("number", "string").contains(f.path("type").asText()),
            "字段元数据无效");
      for (var rr : rows) {
        require(rr.isObject() && rr.size() <= fields.size(), "数据行无效");
        rr.fieldNames().forEachRemaining(k -> require(names.contains(k), "数据行含未知列"));
        for (var value : rr) require(value.isValueNode(), "单元格必须为文本、数值或缺失值");
      }
    }
    for (var r : root.path("tables").path("experiment_datasets")) {
      foreign(ids, "experiments", r.path("experiment_id").asLong());
      foreign(ids, "dataset_versions", r.path("dataset_version_id").asLong());
      require(
          unique.add("e:" + r.path("experiment_id") + ":" + r.path("dataset_version_id")),
          "实验关联重复");
    }
    var chartVersions = new HashMap<Long, Set<Integer>>();
    for (var r : root.path("tables").path("chart_versions")) {
      long chart = r.path("chart_id").asLong();
      foreign(ids, "charts", chart);
      foreign(ids, "dataset_versions", r.path("dataset_version_id").asLong());
      int version = r.path("version").asInt();
      require(
          version > 0 && chartVersions.computeIfAbsent(chart, k -> new HashSet<>()).add(version),
          "图表版本重复或无效");
      var config = tree(r.path("config_json").asText());
      require(
          r.path("schema_version").asInt() == 1
              && config.path("schema_version").asInt() == 1
              && config.path("datasetVersionId").asLong() == r.path("dataset_version_id").asLong(),
          "图表数据引用不一致");
      ConfigValidator.validate(config);
      require(r.path("config_json").asText().length() <= 200000, "图表配置过大");
    }
    for (var c : root.path("tables").path("charts")) {
      var versions = chartVersions.get(c.path("id").asLong());
      int rev = c.path("revision").asInt();
      require(
          versions != null
              && versions.size() == rev
              && versions.stream().allMatch(v -> v >= 1 && v <= rev),
          "图表历史不完整");
    }
    // Validate provenance with an identity mapping before any writes.
    var identity = new HashMap<String, Map<Long, Long>>();
    ids.forEach(
        (t, set) -> {
          var m = new HashMap<Long, Long>();
          set.forEach(id -> m.put(id, id));
          identity.put(t, m);
        });
    var versionsById = new HashMap<Long, JsonNode>();
    for (var r : root.path("tables").path("dataset_versions"))
      versionsById.put(r.path("id").asLong(), r);
    for (var r : root.path("tables").path("dataset_versions"))
      if (!r.path("source_meta_json").isNull()) {
        var meta = tree(r.path("source_meta_json").asText());
        remapMeta(meta, identity, project.path("id").asLong());
        if (meta.path("kind").asText().equals("data_processing")) {
          var source = meta.path("source");
          var original = versionsById.get(source.path("datasetVersionId").asLong());
          require(
              original.path("dataset_id").asLong() == source.path("datasetId").asLong(),
              "派生数据的源版本与源数据集不一致");
          checkVersionReference(source, original);
        } else {
          Set<Long> snapshotIds = new HashSet<>();
          for (var e : meta.path("experiments")) {
            require(
                e.path("project_id").asLong() == project.path("id").asLong()
                    && snapshotIds.add(e.path("id").asLong()),
                "实验快照归属或 ID 无效");
            Set<Long> linked = new HashSet<>(), declared = new HashSet<>();
            for (var link : e.path("datasets")) {
              require(
                  link.path("experiment_id").asLong() == e.path("id").asLong()
                      && linked.add(link.path("dataset_version_id").asLong()),
                  "实验快照关联不一致");
              checkVersionReference(
                  link, versionsById.get(link.path("dataset_version_id").asLong()));
            }
            for (var id : e.path("dataset_version_ids"))
              require(declared.add(id.asLong()), "实验快照关联重复");
            require(linked.equals(declared), "实验快照关联列表不一致");
          }
          require(snapshotIds.contains(meta.path("baseline_id").asLong()), "实验基线不在快照中");
        }
      }
    for (var r : root.path("tables").path("style_templates")) {
      require(r.path("schema_version").asInt() == 1, "不支持的样式模板版本");
      StyleTemplateService.validateProfile(tree(r.path("profile_json").asText()));
    }
  }

  private static void checkVersionReference(JsonNode ref, JsonNode version) {
    require(version != null, "来源版本不存在");
    require(
        ref.path("version").asInt() == version.path("version").asInt()
            && ref.path("filename").equals(version.path("filename"))
            && ref.path("sha256").equals(version.path("sha256")),
        "来源文件、版本或指纹与原版本不一致");
  }

  private static Timestamp timestamp(JsonNode value) {
    try {
      return Timestamp.from(java.time.Instant.parse(value.asText()));
    } catch (Exception e) {
      throw ApiException.bad("备份时间戳无效");
    }
  }

  private static byte[] original(JsonNode r) {
    try {
      byte[] b = Base64.getDecoder().decode(r.path("original_file").asText());
      require(b.length <= 10 * 1024 * 1024, "单个原文件超过 10 MiB");
      return b;
    } catch (IllegalArgumentException e) {
      throw ApiException.bad("原文件编码无效");
    }
  }

  private static void foreign(Map<String, Set<Long>> ids, String table, long id) {
    require(ids.get(table).contains(id), "缺失内部引用：" + table + " #" + id);
  }

  private static long mapped(Map<String, Map<Long, Long>> maps, String table, long id) {
    var value = maps.get(table).get(id);
    require(value != null, "缺失内部引用：" + table + " #" + id);
    return value;
  }

  private static void ref(
      ObjectNode n, String field, String table, Map<String, Map<Long, Long>> maps) {
    require(n.has(field) && n.get(field).isIntegralNumber(), "缺少引用：" + field);
    n.put(field, mapped(maps, table, n.get(field).asLong()));
  }

  private JsonNode remapMeta(JsonNode source, Map<String, Map<Long, Long>> maps, long p) {
    require(source.isObject() && source.path("schema_version").asInt() == 1, "未知来源元数据版本");
    var meta = (ObjectNode) source.deepCopy();
    switch (meta.path("kind").asText()) {
      case "data_processing" -> {
        require(meta.path("source").isObject(), "缺少派生数据来源");
        var s = (ObjectNode) meta.get("source");
        ref(s, "datasetVersionId", "dataset_versions", maps);
        ref(s, "datasetId", "datasets", maps);
      }
      case "experiment_comparison" -> {
        ref(meta, "baseline_id", "experiments", maps);
        require(meta.path("experiments").isArray(), "实验快照无效");
        for (var value : meta.path("experiments")) {
          require(value.isObject(), "实验快照无效");
          var e = (ObjectNode) value;
          ref(e, "id", "experiments", maps);
          e.put("project_id", p);
          require(
              e.path("dataset_version_ids").isArray() && e.path("datasets").isArray(),
              "实验快照缺少数据关联");
          var previous = e.path("dataset_version_ids").deepCopy();
          var versions = e.putArray("dataset_version_ids");
          for (var id : previous) versions.add(mapped(maps, "dataset_versions", id.asLong()));
          for (var link : e.path("datasets")) {
            require(link.isObject(), "实验快照关联无效");
            ref((ObjectNode) link, "experiment_id", "experiments", maps);
            ref((ObjectNode) link, "dataset_version_id", "dataset_versions", maps);
          }
        }
      }
      default -> throw ApiException.bad("未知来源类型，当前版本不能安全恢复");
    }
    return meta;
  }

  public Map<String, Object> preview(byte[] bytes) {
    return summary(read(bytes));
  }

  private Map<String, Object> summary(JsonNode root) {
    var counts = new LinkedHashMap<String, Integer>();
    COLUMNS.keySet().forEach(t -> counts.put(t, root.path("tables").path(t).size()));
    long originalBytes = 0;
    for (var r : root.path("tables").path("dataset_versions")) originalBytes += original(r).length;
    return Map.of(
        "format",
        "labflow-project-v1",
        "name",
        root.path("project").path("name").asText(),
        "created_at",
        root.path("created_at").asText(),
        "counts",
        counts,
        "original_bytes",
        originalBytes);
  }

  @Transactional
  public Map<String, Object> restore(byte[] bytes, String name) {
    require(name != null && !name.isBlank() && name.trim().length() <= 120, "新项目名称须为 1–120 字");
    var root = read(bytes);
    var project = root.path("project");
    try {
      long p =
          db.insert(
              "INSERT INTO projects(name,description,created_at,archived) VALUES(?,?,?,false)",
              name.trim(),
              project.path("description").asText(),
              timestamp(project.path("created_at")));
      var maps = new HashMap<String, Map<Long, Long>>();
      COLUMNS.keySet().forEach(t -> maps.put(t, new HashMap<>()));
      for (var table : COLUMNS.entrySet())
        for (var r : root.path("tables").path(table.getKey())) {
          var values = new LinkedHashMap<String, Object>();
          for (String col : table.getValue())
            if (!col.equals("id")) {
              JsonNode v = r.get(col);
              Object value = v.isNull() ? null : v.isIntegralNumber() ? v.longValue() : v.asText();
              if (col.endsWith("_at")) value = timestamp(v);
              else if (col.equals("original_file")) value = original(r);
              else if (col.equals("project_id")) value = p;
              else if (col.equals("dataset_id")) value = mapped(maps, "datasets", v.asLong());
              else if (col.equals("dataset_version_id"))
                value = mapped(maps, "dataset_versions", v.asLong());
              else if (col.equals("experiment_id")) value = mapped(maps, "experiments", v.asLong());
              else if (col.equals("chart_id")) value = mapped(maps, "charts", v.asLong());
              else if (col.equals("source_meta_json"))
                value = null; // Resolve after all identities exist.
              else if (col.equals("config_json")) {
                var config = (ObjectNode) tree(v.asText());
                config.put(
                    "datasetVersionId",
                    mapped(maps, "dataset_versions", config.path("datasetVersionId").asLong()));
                value = config.toString();
              }
              values.put(col, value);
            }
          String sql =
              "INSERT INTO "
                  + table.getKey()
                  + "("
                  + String.join(",", values.keySet())
                  + ") VALUES("
                  + String.join(",", Collections.nCopies(values.size(), "?"))
                  + ")";
          if (r.has("id"))
            maps.get(table.getKey())
                .put(r.path("id").asLong(), db.insert(sql, values.values().toArray()));
          else db.update(sql, values.values().toArray());
        }
      for (var r : root.path("tables").path("dataset_versions"))
        if (!r.path("source_meta_json").isNull())
          db.update(
              "UPDATE dataset_versions SET source_meta_json=? WHERE id=?",
              remapMeta(tree(r.path("source_meta_json").asText()), maps, p).toString(),
              mapped(maps, "dataset_versions", r.path("id").asLong()));
      for (var r :
          db.query(
              "SELECT v.config_json FROM chart_versions v JOIN charts c ON c.id=v.chart_id WHERE"
                  + " c.project_id=?",
              p)) workspace.validateAndReport(p, tree(r.get("config_json").toString()));
      return Map.of("id", p, "name", name.trim(), "summary", summary(root));
    } catch (DataAccessException e) {
      throw ApiException.bad("备份记录不符合数据库约束，恢复已回滚");
    }
  }
}
