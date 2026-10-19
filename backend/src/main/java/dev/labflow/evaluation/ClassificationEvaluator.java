package dev.labflow.evaluation;

import static dev.labflow.evaluation.EvaluationSupport.*;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.api.ApiException;
import java.util.*;

/** Pure classification report; rows and configuration are never modified. */
public final class ClassificationEvaluator {
  private ClassificationEvaluator() {}

  public static Map<String, Object> evaluate(JsonNode c, List<Map<String, Object>> original) {
    var rows = filtered(c, original);
    validateIdentity(c, rows);
    var k = c.path("classification");
    String labelColumn = k.path("label").asText();
    boolean scores = k.path("input").asText().equals("scores"),
        intersection = c.path("sampling").path("policy").asText().equals("intersection");
    List<String> classes = new ArrayList<>();
    k.path("classes").forEach(v -> classes.add(v.asText()));
    List<JsonNode> series = new ArrayList<>();
    c.path("series")
        .forEach(
            s -> {
              if (s.path("visible").asBoolean()) series.add(s);
            });
    for (var row : rows) {
      if (present(row.get(labelColumn)) && !classes.contains(label(row.get(labelColumn))))
        throw ApiException.bad("真实标签含未知类别，未丢弃样本");
      if (!scores)
        for (var s : series)
          if (present(row.get(s.path("prediction").asText()))
              && !classes.contains(label(row.get(s.path("prediction").asText()))))
            throw ApiException.bad("预测标签含未知类别，未丢弃样本");
    }
    String groupColumn = c.path("group").asText("");
    List<Object> groups = new ArrayList<>();
    if (groupColumn.isEmpty()) groups.add("");
    else
      for (var row : rows)
        if (!groups.contains(row.get(groupColumn))) groups.add(row.get(groupColumn));
    if ((long) groups.size() * series.size() > 100) throw ApiException.bad("分类评估最多 100 个模型分组，请先过滤");
    Map<Map<String, Object>, Integer> numbers = new IdentityHashMap<>();
    for (int i = 0; i < original.size(); i++) numbers.put(original.get(i), i + 1);
    List<Map<String, Object>> reports = new ArrayList<>();
    for (var s : series)
      for (Object group : groups) {
        var selected =
            groupColumn.isEmpty()
                ? rows
                : rows.stream().filter(row -> Objects.equals(row.get(groupColumn), group)).toList();
        var own = selected.stream().filter(row -> valid(row, labelColumn, s, scores)).toList();
        var used =
            intersection
                ? own.stream()
                    .filter(
                        row ->
                            series.stream()
                                .allMatch(model -> valid(row, labelColumn, model, scores)))
                    .toList()
                : own;
        int[][] counts = new int[classes.size()][classes.size()];
        for (var row : used) {
          String prediction =
              scores
                  ? ((Number) row.get(s.path("y").asText())).doubleValue()
                          >= k.path("threshold").asDouble()
                      ? k.path("positive").asText()
                      : classes.stream()
                          .filter(v -> !v.equals(k.path("positive").asText()))
                          .findFirst()
                          .orElseThrow()
                  : label(row.get(s.path("prediction").asText()));
          counts[classes.indexOf(label(row.get(labelColumn)))][classes.indexOf(prediction)]++;
        }
        var metrics = metrics(counts, classes);
        int n = used.size();
        List<List<Double>> matrix = new ArrayList<>();
        String normalization = k.path("normalization").asText();
        for (int i = 0; i < counts.length; i++) {
          List<Double> line = new ArrayList<>();
          for (int j = 0; j < counts.length; j++) {
            int denominator = 1;
            if (normalization.equals("all")) denominator = n;
            if (normalization.equals("true")) denominator = Arrays.stream(counts[i]).sum();
            if (normalization.equals("pred")) {
              denominator = 0;
              for (var r : counts) denominator += r[j];
            }
            line.add(denominator == 0 ? null : (double) counts[i][j] / denominator);
          }
          matrix.add(line);
        }
        var report =
            object(
                "seriesId",
                s.path("id").asText(),
                "groupKey",
                groupKey(group),
                "series",
                s.path("name").asText(),
                "group",
                groupColumn.isEmpty() ? "全部" : group == null ? "缺失" : label(group),
                "classes",
                classes,
                "counts",
                counts,
                "matrix",
                matrix,
                "n",
                n,
                "excluded",
                selected.size() - n,
                "ownMissing",
                selected.size() - own.size(),
                "excludedByOthers",
                own.size() - n,
                "sampleRows",
                used.stream().map(numbers::get).toList());
        report.putAll(metrics);
        reports.add(report);
      }
    return object(
        "schema_version",
        1,
        "datasetVersionId",
        c.path("datasetVersionId").asLong(),
        "classification",
        k,
        "sampling",
        c.has("sampling") ? c.path("sampling") : Map.of("policy", "independent", "id", ""),
        "group",
        groupColumn,
        "transforms",
        c.path("transforms"),
        "series",
        c.path("series"),
        "reports",
        reports);
  }

  private static boolean valid(
      Map<String, Object> row, String label, JsonNode model, boolean scores) {
    Object value = row.get(model.path(scores ? "y" : "prediction").asText());
    return present(row.get(label))
        && (scores
            ? value instanceof Number n && Double.isFinite(n.doubleValue())
            : present(value));
  }

  public static Map<String, Object> metrics(int[][] counts, List<String> classes) {
    int n = 0, correct = 0;
    List<Map<String, Object>> perClass = new ArrayList<>();
    for (int i = 0; i < counts.length; i++) {
      int support = Arrays.stream(counts[i]).sum(), predicted = 0;
      for (var row : counts) predicted += row[i];
      int tp = counts[i][i], fp = predicted - tp, fn = support - tp;
      n += support;
      correct += tp;
      perClass.add(
          object(
              "label",
              classes.get(i),
              "support",
              support,
              "predicted",
              predicted,
              "tp",
              tp,
              "fp",
              fp,
              "fn",
              fn,
              "precision",
              ratio(tp, predicted),
              "recall",
              ratio(tp, support),
              "f1",
              ratio(2 * tp, 2 * tp + fp + fn)));
    }
    Map<String, Object> macro = new LinkedHashMap<>(), weighted = new LinkedHashMap<>();
    for (String key : List.of("precision", "recall", "f1")) {
      Double total = 0.0, weightTotal = 0.0;
      boolean unknown = false, weightUnknown = false;
      for (var m : perClass) {
        Object value = m.get(key);
        int support = ((Number) m.get("support")).intValue();
        if (value == null) unknown = true;
        else total += ((Number) value).doubleValue();
        if (support > 0) {
          if (value == null) weightUnknown = true;
          else weightTotal += support * ((Number) value).doubleValue();
        }
      }
      macro.put(key, unknown ? null : total / classes.size());
      weighted.put(key, n == 0 || weightUnknown ? null : weightTotal / n);
    }
    Double accuracy = ratio(correct, n);
    return object(
        "perClass",
        perClass,
        "macro",
        macro,
        "weighted",
        weighted,
        "micro",
        object("precision", accuracy, "recall", accuracy, "f1", accuracy),
        "accuracy",
        accuracy);
  }

  private static Double ratio(int numerator, int denominator) {
    return denominator == 0 ? null : (double) numerator / denominator;
  }
}
