package dev.labflow.evaluation;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.api.ApiException;
import java.math.BigDecimal;
import java.util.*;

public final class EvaluationSupport {
  private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
      new com.fasterxml.jackson.databind.ObjectMapper();

  private EvaluationSupport() {}

  public static String groupKey(Object value) {
    if (value instanceof Number) return label(value);
    try {
      return JSON.writeValueAsString(value);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public static boolean present(Object value) {
    return value != null && !value.equals("");
  }

  public static String label(Object value) {
    if (value == null) return "null";
    if (value instanceof Number n) {
      var v = new BigDecimal(value.toString()).stripTrailingZeros();
      double abs = Math.abs(n.doubleValue());
      return abs != 0 && (abs < 1e-6 || abs >= 1e21)
          ? v.toString().replace("E", "e")
          : v.toPlainString();
    }
    return value.toString();
  }

  public static List<Map<String, Object>> filtered(JsonNode c, List<Map<String, Object>> rows) {
    return rows.stream()
        .filter(
            row -> {
              for (var t : c.path("transforms")) {
                Object value = row.get(t.path("field").asText());
                String target = t.path("value").asText(), op = t.path("operator").asText();
                if (op.equals("eq")) {
                  if (!label(value).equals(target)) return false;
                } else {
                  try {
                    double v = Double.parseDouble(String.valueOf(value)),
                        bound = Double.parseDouble(target);
                    if (!Double.isFinite(v)
                        || !Double.isFinite(bound)
                        || (op.equals("gte") ? v < bound : v > bound)) return false;
                  } catch (NumberFormatException e) {
                    return false;
                  }
                }
              }
              return true;
            })
        .toList();
  }

  public static void validateIdentity(JsonNode c, List<Map<String, Object>> rows) {
    String id = c.path("sampling").path("id").asText("");
    if (id.isEmpty()) return;
    Set<String> seen = new HashSet<>();
    for (var row : rows)
      if (!present(row.get(id)) || !seen.add(label(row.get(id))))
        throw ApiException.bad("样本 ID 在当前过滤后的数据中必须非缺失且唯一");
  }

  public static Map<String, Object> object(Object... values) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (int i = 0; i < values.length; i += 2) result.put(values[i].toString(), values[i + 1]);
    return result;
  }
}
