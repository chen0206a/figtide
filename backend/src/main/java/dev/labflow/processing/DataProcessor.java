package dev.labflow.processing;

import dev.labflow.api.ApiException;
import java.math.*;
import java.util.*;
import org.springframework.stereotype.Component;

/** Deterministic, pure processing over immutable parsed source rows. */
@Component
public class DataProcessor {
  public record Statistic(String metric, Map<String, String> columns) {}

  public record Result(
      List<Map<String, Object>> fields,
      List<Map<String, Object>> rows,
      List<String> warnings,
      List<Statistic> statistics,
      Map<String, Integer> counts) {}

  private static final MathContext MC = MathContext.DECIMAL128;
  private static final List<String> STATS =
      List.of("total", "n", "missing", "mean", "sd", "sem", "lower", "upper");

  public Result process(
      List<Map<String, Object>> fields, List<Map<String, Object>> original, ProcessingRules rules) {
    if (rules == null) throw ApiException.bad("缺少处理规则");
    rules.validate();
    Map<String, String> types = new LinkedHashMap<>();
    fields.forEach(f -> types.put(f.get("name").toString(), f.get("type").toString()));
    for (var f : rules.filters()) {
      require(types.containsKey(f.field()), "过滤字段不属于源版本");
      if (Set.of("gte", "lte").contains(f.operator())) {
        require(types.get(f.field()).equals("number"), "大小过滤仅支持数值列");
        decimal(f.value());
      }
      if (f.operator().equals("eq") && types.get(f.field()).equals("number")) decimal(f.value());
    }
    var selected = original.stream().filter(r -> matches(r, rules.filters(), types)).toList();
    require(!selected.isEmpty(), "过滤后没有数据，未创建空数据集");
    List<Map<String, Object>> rows = new ArrayList<>();
    Map<String, String> outputTypes = new LinkedHashMap<>();
    List<Statistic> statistics = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    int missingGroupRows = 0, groups = 0, small = 0, empty = 0;
    if (rules.mode().equals("sort")) {
      for (var r : selected) rows.add(new LinkedHashMap<>(r));
      outputTypes.putAll(types);
    } else {
      for (var g : rules.groupBy()) require(types.containsKey(g), "分组字段不属于源版本");
      for (var m : rules.metrics()) require("number".equals(types.get(m)), "统计指标必须是源版本的数值列");
      require(rules.replicate().isEmpty() || types.containsKey(rules.replicate()), "重复标识字段不属于源版本");
      require(rules.x().isEmpty() || rules.groupBy().contains(rules.x()), "汇总图 X 必须选择分组字段");
      require(rules.group().isEmpty() || rules.groupBy().contains(rules.group()), "绘图分组必须选择分组字段");
      require(rules.x().isEmpty() || !rules.x().equals(rules.group()), "X 与绘图分组不能使用同一字段");
      if (rules.display().equals("band"))
        require(!rules.x().isEmpty() && "number".equals(types.get(rules.x())), "区间带需要数值 X 分组字段");
      rules.groupBy().forEach(g -> outputTypes.put(g, types.get(g)));
      if (rules.groupBy().isEmpty()) outputTypes.put("__summary", "string");
      Set<String> occupied = new HashSet<>(rules.groupBy());
      for (int i = 0; i < rules.metrics().size(); i++) {
        String metric = rules.metrics().get(i);
        Map<String, String> columns = new LinkedHashMap<>();
        for (String stat : STATS) {
          String base = metric.substring(0, Math.min(metric.length(), 105)) + "__" + stat,
              name = base;
          for (int suffix = 1; occupied.contains(name); suffix++) name = base + "_" + suffix;
          occupied.add(name);
          columns.put(stat, name);
          outputTypes.put(name, "number");
        }
        statistics.add(new Statistic(metric, columns));
      }
      Map<List<Object>, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
      for (var row : selected) {
        List<Object> key = rules.groupBy().stream().map(row::get).toList();
        if (key.contains(null)) {
          missingGroupRows++;
          if (rules.missingGroup().equals("exclude")) continue;
        }
        grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
      }
      groups = grouped.size();
      require(groups > 0, "排除缺失分组后没有数据");
      for (var entry : grouped.entrySet()) {
        var samples = entry.getValue();
        if (!rules.replicate().isEmpty()) {
          Set<Object> ids = new HashSet<>();
          for (var r : samples)
            require(
                r.get(rules.replicate()) != null && ids.add(r.get(rules.replicate())),
                "同组的重复标识必须非缺失且唯一；请检查分组条件或观测单位");
        }
        Map<String, Object> row = new LinkedHashMap<>();
        if (rules.groupBy().isEmpty()) row.put("__summary", "全部");
        for (int i = 0; i < rules.groupBy().size(); i++)
          row.put(rules.groupBy().get(i), entry.getKey().get(i));
        for (var stat : statistics) {
          var values =
              samples.stream()
                  .map(r -> r.get(stat.metric()))
                  .filter(v -> v instanceof Number && Double.isFinite(((Number) v).doubleValue()))
                  .map(v -> new BigDecimal(v.toString()))
                  .toList();
          int n = values.size();
          if (n < 2) small++;
          if (n == 0) empty++;
          var columns = stat.columns();
          row.put(columns.get("total"), samples.size());
          row.put(columns.get("n"), n);
          row.put(columns.get("missing"), samples.size() - n);
          BigDecimal mean =
              n == 0
                  ? null
                  : values.stream()
                      .reduce(BigDecimal.ZERO, BigDecimal::add)
                      .divide(BigDecimal.valueOf(n), MC);
          BigDecimal sd = null, sem = null;
          if (n >= 2) {
            BigDecimal sum = BigDecimal.ZERO;
            for (var v : values) {
              var delta = v.subtract(mean);
              sum = sum.add(delta.multiply(delta));
            }
            sd = sum.divide(BigDecimal.valueOf(n - 1), MC).sqrt(MC);
            sem = sd.divide(BigDecimal.valueOf(n).sqrt(MC), MC);
          }
          BigDecimal error =
              rules.error().equals("sd") ? sd : rules.error().equals("sem") ? sem : null;
          row.put(columns.get("mean"), finite(mean));
          row.put(columns.get("sd"), finite(sd));
          row.put(columns.get("sem"), finite(sem));
          row.put(columns.get("lower"), error == null ? null : finite(mean.subtract(error)));
          row.put(columns.get("upper"), error == null ? null : finite(mean.add(error)));
        }
        rows.add(row);
      }
      if (small > 0) warnings.add(small + " 个组/指标有效 n < 2，SD、SEM 和区间保持缺失，不当作零");
      if (empty > 0) warnings.add(empty + " 个组/指标没有有效观测，均值保持缺失");
      if (missingGroupRows > 0)
        warnings.add(
            missingGroupRows
                + " 行含缺失分组值，已按规则"
                + (rules.missingGroup().equals("exclude") ? "排除" : "保留为独立分组"));
      warnings.add("样本标准差使用 n−1；SEM=SD/√n，解释依赖独立观测假设，不是置信区间");
    }
    require(
        rows.size() <= 20000 && (long) rows.size() * outputTypes.size() <= 200000,
        "结果超过 20,000 行或 200,000 个单元格，请减少指标或调整分组");
    for (var s : rules.sort()) require(outputTypes.containsKey(s.field()), "排序字段不属于处理结果");
    rows.sort(
        (a, b) -> {
          for (var s : rules.sort()) {
            Object av = a.get(s.field()), bv = b.get(s.field());
            int value;
            if (av == null || bv == null) {
              value = av == bv ? 0 : av == null ? 1 : -1;
              if (value != 0) return value;
            } else {
              value =
                  outputTypes.get(s.field()).equals("number")
                      ? new BigDecimal(av.toString()).compareTo(new BigDecimal(bv.toString()))
                      : av.toString().compareTo(bv.toString());
              if (value != 0) return s.direction().equals("desc") ? -value : value;
            }
          }
          return 0;
        });
    List<Map<String, Object>> outFields = new ArrayList<>();
    for (var column : outputTypes.entrySet()) {
      var f = new LinkedHashMap<String, Object>();
      String name = column.getKey();
      f.put("name", name);
      f.put("type", column.getValue());
      f.put("missing", rows.stream().filter(r -> r.get(name) == null).count());
      String role = "none";
      if (rules.mode().equals("sort"))
        role =
            fields.stream()
                .filter(v -> name.equals(v.get("name")))
                .map(v -> Objects.toString(v.get("role"), "none"))
                .findFirst()
                .orElse("none");
      else if (name.equals(rules.x())) role = "x";
      else if (name.equals(rules.group())) role = "group";
      else if (name.equals("__summary") && rules.groupBy().isEmpty()) role = "x";
      else if (statistics.stream().anyMatch(s -> s.columns().get("mean").equals(name))) role = "y";
      f.put("role", role);
      outFields.add(f);
    }
    return new Result(
        outFields,
        rows,
        warnings,
        statistics,
        Map.of(
            "source_rows",
            original.size(),
            "filtered_rows",
            selected.size(),
            "excluded_rows",
            original.size()
                - selected.size()
                + (rules.missingGroup().equals("exclude") ? missingGroupRows : 0),
            "output_rows",
            rows.size(),
            "groups",
            groups,
            "missing_group_rows",
            missingGroupRows));
  }

  private static boolean matches(
      Map<String, Object> row, List<ProcessingRules.Filter> filters, Map<String, String> types) {
    for (var f : filters) {
      Object value = row.get(f.field());
      if (f.operator().equals("missing")) {
        if (value != null) return false;
      } else if (f.operator().equals("eq")) {
        if (value == null
            || (types.get(f.field()).equals("number")
                ? new BigDecimal(value.toString()).compareTo(decimal(f.value())) != 0
                : !text(value).equals(f.value()))) return false;
      } else {
        if (!(value instanceof Number)) return false;
        int cmp = new BigDecimal(value.toString()).compareTo(decimal(f.value()));
        if (f.operator().equals("gte") ? cmp < 0 : cmp > 0) return false;
      }
    }
    return true;
  }

  private static String text(Object v) {
    return v instanceof Number
        ? new BigDecimal(v.toString()).stripTrailingZeros().toPlainString()
        : v.toString();
  }

  private static BigDecimal decimal(String v) {
    try {
      return new BigDecimal(v.trim());
    } catch (Exception e) {
      throw ApiException.bad("过滤边界必须是有限十进制数值");
    }
  }

  private static Double finite(BigDecimal value) {
    if (value == null) return null;
    double v = value.doubleValue();
    require(Double.isFinite(v) && (v != 0 || value.signum() == 0), "统计结果超出可表示数值范围，请先显式调整数据单位");
    return v;
  }

  private static void require(boolean valid, String message) {
    if (!valid) throw ApiException.bad(message);
  }
}
