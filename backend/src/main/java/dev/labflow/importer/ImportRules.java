package dev.labflow.importer;

import dev.labflow.api.ApiException;
import java.util.*;

/** Versioned import contract shared by preview and commit. Never mutates original bytes. */
public record ImportRules(
    int schema_version,
    String delimiter,
    int sheet,
    List<String> missingValues,
    Map<String, String> types,
    Map<String, String> roles) {
  public static ImportRules defaults() {
    return new ImportRules(1, ",", 0, List.of(), Map.of(), Map.of());
  }

  public void validate() {
    if (schema_version != 1
        || !Set.of(",", ";", "\t").contains(delimiter == null ? "" : delimiter)
        || sheet < 0
        || missingValues == null
        || types == null
        || roles == null
        || missingValues.size() > 30
        || types.size() > 100
        || roles.size() > 100) throw ApiException.bad("导入规则无效");
    if (missingValues.stream().anyMatch(s -> s == null || s.length() > 100)
        || types.values().stream().anyMatch(v -> !Set.of("number", "string").contains(v))
        || roles.values().stream()
            .anyMatch(v -> !Set.of("none", "x", "y", "group", "error").contains(v)))
      throw ApiException.bad("字段类型、角色或缺失符号无效");
    for (String role : List.of("x", "group", "error"))
      if (Collections.frequency(new ArrayList<>(roles.values()), role) > 1)
        throw ApiException.bad("X、分组、误差角色各只能指定一个字段");
  }
}
