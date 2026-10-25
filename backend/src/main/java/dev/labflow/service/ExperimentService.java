package dev.labflow.service;

import com.fasterxml.jackson.databind.*;
import dev.labflow.api.ApiException;
import dev.labflow.importer.ImportRules;
import dev.labflow.repository.WorkspaceRepository;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExperimentService {
  private final WorkspaceRepository db;
  private final ObjectMapper json;
  private final WorkspaceService workspace;

  public ExperimentService(WorkspaceRepository db, ObjectMapper json, WorkspaceService workspace) {
    this.db = db;
    this.json = json;
    this.workspace = workspace;
  }

  private String encode(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (Exception e) {
      throw ApiException.bad("无法保存实验内容");
    }
  }

  private Object decode(Object value) {
    try {
      return json.readValue(value.toString(), Object.class);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private Map<String, Object> unpack(Map<String, Object> row) {
    var result = new LinkedHashMap<>(row);
    for (String k : List.of("parameters", "metrics")) result.put(k, decode(result.get(k)));
    result.put(
        "tags", result.get("tags_json") == null ? List.of() : decode(result.get("tags_json")));
    result.remove("tags_json");
    return result;
  }

  public List<Map<String, Object>> list(long p) {
    workspace.project(p);
    var rows =
        db.query(
            "SELECT * FROM experiments WHERE project_id=? ORDER BY updated_at DESC,id DESC", p);
    var links =
        db.query(
            "SELECT ed.experiment_id,ed.dataset_version_id,v.filename,v.version,v.sha256 FROM"
                + " experiment_datasets ed JOIN experiments e ON ed.experiment_id=e.id JOIN"
                + " dataset_versions v ON v.id=ed.dataset_version_id WHERE e.project_id=? ORDER BY"
                + " ed.dataset_version_id",
            p);
    return rows.stream()
        .map(
            row -> {
              var r = unpack(row);
              var matches =
                  links.stream().filter(l -> l.get("experiment_id").equals(r.get("id"))).toList();
              r.put(
                  "dataset_version_ids",
                  matches.stream().map(l -> l.get("dataset_version_id")).toList());
              r.put("datasets", matches);
              return r;
            })
        .toList();
  }

  @Transactional(isolation = Isolation.READ_COMMITTED)
  public Map<String, Object> save(
      long p,
      Long id,
      String name,
      JsonNode parameters,
      JsonNode metrics,
      String notes,
      String status,
      List<String> tags,
      List<Long> datasetIds,
      Integer revision) {
    workspace.project(p);
    if (!parameters.isObject() || !metrics.isObject()) throw ApiException.bad("参数和指标必须为 JSON 对象");
    validateValues(parameters, 0);
    validateValues(metrics, 0);
    if (parameters.size() > 100
        || metrics.size() > 100
        || encode(parameters).length() > 100000
        || encode(metrics).length() > 100000) throw ApiException.bad("参数或指标超过大小限制");
    for (var it = parameters.fieldNames(); it.hasNext(); ) validateKey(it.next());
    for (var it = metrics.fieldNames(); it.hasNext(); ) validateKey(it.next());
    Map<String, Object> old =
        id == null
            ? null
            : db.one("SELECT * FROM experiments WHERE id=? AND project_id=? FOR UPDATE", id, p);
    int current = old == null ? 0 : ((Number) old.get("revision")).intValue();
    if (old != null && revision != null && revision != current)
      throw new ApiException(409, "实验已被更新，请刷新记录后重新编辑；当前输入仍保留");
    String state = status != null ? status : old == null ? "planned" : old.get("status").toString();
    if (!Set.of("planned", "running", "completed", "failed").contains(state))
      throw ApiException.bad("实验状态无效");
    if (tags != null
        && (tags.size() > 20
            || tags.stream().anyMatch(t -> t == null || t.isBlank() || t.length() > 40)))
      throw ApiException.bad("最多 20 个标签，每个 1–40 字符");
    String tagJson =
        tags == null
            ? (old == null || old.get("tags_json") == null ? "[]" : old.get("tags_json").toString())
            : encode(tags.stream().map(String::trim).distinct().toList());
    if (datasetIds != null) {
      if (datasetIds.size() > 50
          || datasetIds.stream().anyMatch(v -> v == null || v <= 0)
          || new HashSet<>(datasetIds).size() != datasetIds.size())
        throw ApiException.bad("关联版本列表无效（最多 50 个）");
      for (long version : datasetIds)
        db.one(
            "SELECT v.id FROM dataset_versions v JOIN datasets d ON d.id=v.dataset_id WHERE v.id=?"
                + " AND d.project_id=?",
            version,
            p);
    }
    if (id == null)
      id =
          db.insert(
              "INSERT INTO"
                  + " experiments(project_id,name,parameters,metrics,notes,status,tags_json,revision)"
                  + " VALUES(?,?,?,?,?,?,?,1)",
              p,
              name.trim(),
              encode(parameters),
              encode(metrics),
              notes,
              state,
              tagJson);
    else
      db.update(
          "UPDATE experiments SET"
              + " name=?,parameters=?,metrics=?,notes=?,status=?,tags_json=?,revision=revision+1,"
              // H2 无 ON UPDATE CURRENT_TIMESTAMP(3)（h2 迁移已去掉该子句），MySQL/H2 双兼容显式赋值
              + " updated_at=CURRENT_TIMESTAMP(3)"
              + " WHERE id=? AND project_id=?",
          name.trim(),
          encode(parameters),
          encode(metrics),
          notes,
          state,
          tagJson,
          id,
          p);
    if (datasetIds != null) {
      db.update("DELETE FROM experiment_datasets WHERE experiment_id=?", id);
      for (long version : datasetIds)
        db.update(
            "INSERT INTO experiment_datasets(experiment_id,dataset_version_id) VALUES(?,?)",
            id,
            version);
    }
    long saved = id;
    return list(p).stream()
        .filter(e -> ((Number) e.get("id")).longValue() == saved)
        .findFirst()
        .orElseThrow();
  }

  private void validateKey(String key) {
    if (key.isBlank() || key.length() > 120) throw ApiException.bad("字段名称必须为 1–120 字符");
  }

  private void validateValues(JsonNode value, int depth) {
    if (depth > 30) throw ApiException.bad("JSON 嵌套过深");
    if (value.isNumber() && !Double.isFinite(value.asDouble())) throw ApiException.bad("数值超出可用范围");
    if (value.isContainerNode()) for (JsonNode child : value) validateValues(child, depth + 1);
  }

  public record Selection(long id, int revision) {}

  @Transactional(isolation = Isolation.READ_COMMITTED)
  public Map<String, Object> snapshot(
      long p,
      List<Selection> selections,
      long baseline,
      String metric,
      String direction,
      String chartType) {
    workspace.project(p);
    if (selections == null
        || selections.size() < 2
        || selections.size() > 8
        || selections.stream().anyMatch(Objects::isNull)) throw ApiException.bad("请选择 2–8 个实验");
    var ids = selections.stream().map(Selection::id).toList();
    if (new HashSet<>(ids).size() != ids.size() || !ids.contains(baseline))
      throw ApiException.bad("实验或基线选择无效");
    validateKey(metric);
    if (!Set.of("higher", "lower").contains(direction)
        || !Set.of("bar", "scatter").contains(chartType)) throw ApiException.bad("指标方向或图表类型无效");
    // Consistent lock ordering prevents overlapping comparisons from deadlocking.
    for (var selection :
        selections.stream().sorted(Comparator.comparingLong(Selection::id)).toList()) {
      var row =
          db.one(
              "SELECT revision FROM experiments WHERE id=? AND project_id=? FOR UPDATE",
              selection.id(),
              p);
      if (((Number) row.get("revision")).intValue() != selection.revision())
        throw new ApiException(409, "所选实验已变化，请刷新对比后重新生成");
    }
    var all = list(p);
    var records =
        ids.stream()
            .map(
                id ->
                    all.stream()
                        .filter(r -> ((Number) r.get("id")).longValue() == id)
                        .findFirst()
                        .orElseThrow())
            .toList();
    StringBuilder csv = new StringBuilder("experiment,metric_value\n");
    int valid = 0;
    for (var record : records) {
      var value = ((Map<?, ?>) record.get("metrics")).get(metric);
      String numeric = "";
      if (value instanceof Number n && Double.isFinite(n.doubleValue())) {
        numeric = n.toString();
        valid++;
      }
      String label = record.get("name") + " (#" + record.get("id") + ")";
      csv.append('"')
          .append(label.replace("\"", "\"\""))
          .append("\",")
          .append(numeric)
          .append('\n');
    }
    if (valid < 2) throw ApiException.bad("至少两个实验需要该指标的有限数值，缺失或文本不会按 0 处理");
    var rules =
        new ImportRules(
            1,
            ",",
            0,
            List.of(),
            Map.of("experiment", "string", "metric_value", "number"),
            Map.of("experiment", "x", "metric_value", "y"));
    var dataset =
        workspace.upload(
            p,
            null,
            "comparison-" + UUID.randomUUID() + ".csv",
            csv.toString().getBytes(StandardCharsets.UTF_8),
            rules);
    var source = new LinkedHashMap<String, Object>();
    source.put("schema_version", 1);
    source.put("kind", "experiment_comparison");
    source.put("created_at", Instant.now().toString());
    source.put("metric", metric);
    source.put("direction", direction);
    source.put("baseline_id", baseline);
    source.put("chart_type", chartType);
    source.put("experiments", records);
    source.put("missing_count", records.size() - valid);
    db.update(
        "UPDATE dataset_versions SET source_meta_json=? WHERE id=?",
        encode(source),
        dataset.get("id"));
    db.update(
        "UPDATE datasets SET name=? WHERE id=?", metric + " · 实验对比快照", dataset.get("dataset_id"));
    return workspace.data(p, ((Number) dataset.get("id")).longValue());
  }
}
