package dev.labflow.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.labflow.api.ApiException;
import dev.labflow.processing.*;
import dev.labflow.repository.WorkspaceRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProcessingService {
  private final WorkspaceService workspace;
  private final WorkspaceRepository db;
  private final DataProcessor processor;
  private final ObjectMapper json;

  public ProcessingService(
      WorkspaceService workspace,
      WorkspaceRepository db,
      DataProcessor processor,
      ObjectMapper json) {
    this.workspace = workspace;
    this.db = db;
    this.processor = processor;
    this.json = json;
  }

  @SuppressWarnings("unchecked")
  private DataProcessor.Result calculate(Map<String, Object> source, ProcessingRules rules) {
    return processor.process(
        (List<Map<String, Object>>) source.get("fields"),
        (List<Map<String, Object>>) source.get("rows"),
        rules);
  }

  public Map<String, Object> preview(long p, long id, ProcessingRules rules) {
    var source = workspace.data(p, id);
    var result = calculate(source, rules);
    var response = new LinkedHashMap<String, Object>();
    response.put("fields", result.fields());
    response.put("rows", result.rows().stream().limit(20).toList());
    response.put("row_count", result.rows().size());
    response.put("warnings", result.warnings());
    response.put("statistics", result.statistics());
    response.put("counts", result.counts());
    response.put("rules", rules);
    response.put("source", reference(source));
    return response;
  }

  @Transactional
  public Map<String, Object> commit(long p, long id, String name, ProcessingRules rules) {
    if (name == null
        || name.isBlank()
        || name.length() > 120
        || name.matches("(?s).*[\\\\/\\x00-\\x1f].*"))
      throw ApiException.bad("结果名称须为 1–120 字符，不能包含路径或控制字符");
    var source = workspace.data(p, id);
    var result = calculate(source, rules);
    StringBuilder csv = new StringBuilder();
    var names = result.fields().stream().map(f -> f.get("name").toString()).toList();
    csv.append(String.join(",", names.stream().map(ProcessingService::quote).toList()))
        .append('\n');
    for (var row : result.rows())
      csv.append(
              String.join(
                  ",",
                  names.stream()
                      .map(n -> row.get(n) == null ? "" : quote(row.get(n).toString()))
                      .toList()))
          .append('\n');
    byte[] bytes = csv.toString().getBytes(StandardCharsets.UTF_8);
    if (bytes.length > 10 * 1024 * 1024) throw ApiException.bad("处理结果超过 10 MB，请缩小处理范围");
    Map<String, Object> meta = new LinkedHashMap<>();
    meta.put("schema_version", 1);
    meta.put("kind", "data_processing");
    meta.put("algorithm", "group-summary-v1");
    meta.put("numeric_encoding", "decimal-strings-v1");
    meta.put("created_at", Instant.now().toString());
    meta.put("source", reference(source));
    meta.put("rules", rules);
    meta.put("statistics", result.statistics());
    meta.put("counts", result.counts());
    long dataset = db.insert("INSERT INTO datasets(project_id,name) VALUES(?,?)", p, name.trim());
    String hash;
    try {
      hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
    long version =
        db.insert(
            "INSERT INTO"
                + " dataset_versions(dataset_id,version,filename,sha256,original_file,fields_json,rows_json,warnings_json,row_count,source_meta_json)"
                + " VALUES(?,1,?,?,?,?,?,?,?,?)",
            dataset,
            name.trim() + ".csv",
            hash,
            bytes,
            encode(result.fields()),
            encode(storageRows(result)),
            encode(result.warnings()),
            result.rows().size(),
            encode(meta));
    return workspace.data(p, version);
  }

  private static Map<String, Object> reference(Map<String, Object> s) {
    return Map.of(
        "datasetVersionId",
        s.get("id"),
        "datasetId",
        s.get("dataset_id"),
        "version",
        s.get("version"),
        "filename",
        s.get("filename"),
        "sha256",
        s.get("sha256"));
  }

  private static String quote(String value) {
    return "\"" + value.replace("\"", "\"\"") + "\"";
  }

  // MySQL JSON's binary-double conversion can change the last decimal digit.
  // Keep numeric tokens as strings internally; WorkspaceService restores their public number type.
  private static List<Map<String, Object>> storageRows(DataProcessor.Result result) {
    return result.rows().stream()
        .map(
            row -> {
              Map<String, Object> stored = new LinkedHashMap<>();
              row.forEach(
                  (key, value) ->
                      stored.put(key, value instanceof Number ? value.toString() : value));
              return stored;
            })
        .toList();
  }

  private String encode(Object v) {
    try {
      return json.writeValueAsString(v);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
