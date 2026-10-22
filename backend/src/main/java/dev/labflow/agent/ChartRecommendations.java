package dev.labflow.agent;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import java.util.*;

/** Typed chart plans only; no configuration writes, statistics or invented observations. */
public final class ChartRecommendations {
  private static final ObjectMapper JSON = new ObjectMapper();
  public static final List<String> TYPES =
      List.of("line", "bar", "scatter", "heatmap", "box", "violin", "histogram", "ecdf");

  public static ObjectNode definition() {
    var out = JSON.createObjectNode().put("type", "function");
    var fn =
        out.putObject("function")
            .put("name", "recommend_charts")
            .put("description", "根据真实字段画像提供1到3种不同图型的方案，说明适合回答的问题与限制；不执行绘制、不写图表。");
    var schema =
        fn.putObject("parameters").put("type", "object").put("additionalProperties", false);
    schema.putArray("required").add("charts");
    var item =
        schema
            .putObject("properties")
            .putObject("charts")
            .put("type", "array")
            .put("minItems", 1)
            .put("maxItems", 3)
            .putObject("items")
            .put("type", "object")
            .put("additionalProperties", false);
    item.putArray("required")
        .add("type")
        .add("x")
        .add("ys")
        .add("group")
        .add("heatY")
        .add("heatZ")
        .add("title")
        .add("reason")
        .add("caveat");
    var props = item.putObject("properties");
    var types = props.putObject("type").put("type", "string").putArray("enum");
    TYPES.forEach(types::add);
    for (String key : List.of("x", "group", "heatY", "heatZ", "title", "reason", "caveat"))
      props
          .putObject(key)
          .put("type", "string")
          .put("maxLength", key.equals("reason") ? 400 : key.equals("caveat") ? 240 : 120);
    props
        .putObject("ys")
        .put("type", "array")
        .put("minItems", 1)
        .put("maxItems", 8)
        .put("uniqueItems", true)
        .putObject("items")
        .put("type", "string")
        .put("maxLength", 120);
    return out;
  }

  public static ArrayNode validate(JsonNode args, JsonNode profile) {
    if (!args.isObject() || args.size() != 1 || !args.has("charts"))
      throw ApiException.bad("推荐只接受charts方案列表");
    var plans = args.path("charts");
    if (!plans.isArray() || plans.isEmpty() || plans.size() > 3)
      throw ApiException.bad("请提供1到3个方案");
    Map<String, JsonNode> fields = new HashMap<>();
    profile.path("fields").forEach(f -> fields.put(f.path("name").asText(), f));
    Set<String> types = new HashSet<>();
    var result = JSON.createArrayNode();
    var allowed = Set.of("type", "x", "ys", "group", "heatY", "heatZ", "title", "reason", "caveat");
    for (var plan : plans) {
      if (!plan.isObject()) throw ApiException.bad("推荐方案需要对象格式");
      plan.fieldNames()
          .forEachRemaining(
              k -> {
                if (!allowed.contains(k)) throw ApiException.bad("不支持的推荐字段：" + k);
              });
      String type = plan.path("type").asText();
      if (!TYPES.contains(type) || !types.add(type)) throw ApiException.bad("推荐图型不支持或重复");
      for (String key : List.of("x", "group", "heatY", "heatZ", "title", "reason", "caveat")) {
        var v = plan.path(key);
        int max = key.equals("reason") ? 400 : key.equals("caveat") ? 240 : 120;
        if (!v.isTextual() || v.asText().length() > max)
          throw ApiException.bad("推荐的" + key + "格式或长度无效");
      }
      if (plan.path("title").asText().isBlank() || plan.path("reason").asText().isBlank())
        throw ApiException.bad("方案需要标题和推荐理由");
      field(
          fields,
          plan.path("x").asText(),
          type.equals("scatter") || Set.of("histogram", "ecdf").contains(type));
      if (!plan.path("group").asText().isBlank()) field(fields, plan.path("group").asText(), false);
      var ys = plan.path("ys");
      if (!ys.isArray() || ys.isEmpty() || ys.size() > 8) throw ApiException.bad("每个方案需要1到8个Y字段");
      Set<String> seen = new HashSet<>();
      for (var y : ys) {
        if (!y.isTextual() || !seen.add(y.asText())) throw ApiException.bad("Y字段必须唯一");
        field(fields, y.asText(), true);
      }
      if (type.equals("heatmap")) {
        field(fields, plan.path("heatY").asText(), false);
        field(fields, plan.path("heatZ").asText(), true);
        if (plan.path("x").equals(plan.path("heatY"))) throw ApiException.bad("热力图X/Y字段应不同");
      } else if (!plan.path("heatY").asText().isBlank() || !plan.path("heatZ").asText().isBlank())
        throw ApiException.bad("非热力图不设置矩阵字段");
      var safe = (ObjectNode) plan.deepCopy();
      safe.put("id", "plan-" + (result.size() + 1));
      result.add(safe);
    }
    return result;
  }

  private static void field(Map<String, JsonNode> fields, String key, boolean numeric) {
    JsonNode f = fields.get(key);
    if (f == null
        || (numeric && !f.path("type").asText().equals("number"))
        || f.path("unique").asLong() == 0) throw ApiException.bad("推荐引用了不存在、无观测值或类型不适合的字段：" + key);
  }
}
