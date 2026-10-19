package dev.labflow.processing;

import dev.labflow.api.ApiException;
import java.util.*;

public record ProcessingRules(
    int schema_version,
    String mode,
    List<String> groupBy,
    List<String> metrics,
    List<Filter> filters,
    List<Order> sort,
    String missingGroup,
    String error,
    String observationUnit,
    String replicate,
    String x,
    String group,
    String display) {
  public record Filter(String field, String operator, String value) {}

  public record Order(String field, String direction) {}

  public void validate() {
    if (schema_version != 1 || !Set.of("aggregate", "sort").contains(Objects.toString(mode, "")))
      bad("不支持的处理规则版本或模式");
    if (groupBy == null
        || metrics == null
        || filters == null
        || sort == null
        || groupBy.size() > 4
        || metrics.size() > 5
        || filters.size() > 8
        || sort.size() > 4) bad("分组最多 4 列、指标 5 列、过滤 8 条、排序 4 条");
    for (var list : List.of(groupBy, metrics)) {
      if (list.stream().anyMatch(v -> v == null || v.isBlank() || v.length() > 120)
          || new HashSet<>(list).size() != list.size()) bad("字段列表无效或重复");
    }
    if (!Set.of("include", "exclude").contains(Objects.toString(missingGroup, ""))
        || !Set.of("sd", "sem", "none").contains(Objects.toString(error, ""))
        || !Set.of("bars", "band").contains(Objects.toString(display, ""))) bad("缺失分组、误差或显示方式无效");
    for (var value : Arrays.asList(observationUnit, replicate, x, group))
      if (value == null || value.length() > 120) bad("观测单位或字段无效");
    if (mode.equals("aggregate") && (metrics.isEmpty() || observationUnit.isBlank()))
      bad("请选择数值指标并说明每行代表的观测单位");
    for (var f : filters)
      if (f == null
          || f.field() == null
          || f.field().isBlank()
          || f.field().length() > 120
          || f.value() == null
          || f.value().length() > 500
          || !Set.of("eq", "gte", "lte", "missing").contains(Objects.toString(f.operator(), "")))
        bad("过滤规则无效");
    Set<String> sorted = new HashSet<>();
    for (var s : sort)
      if (s == null
          || s.field() == null
          || s.field().isBlank()
          || s.field().length() > 120
          || !sorted.add(s.field())
          || !Set.of("asc", "desc").contains(Objects.toString(s.direction(), "")))
        bad("排序字段重复或排序规则无效");
  }

  private static void bad(String message) {
    throw ApiException.bad(message);
  }
}
