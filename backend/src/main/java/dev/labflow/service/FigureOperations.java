package dev.labflow.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import java.util.*;

/** Provider-independent, deterministic operations. No JSON paths, code, or data writes as input. */
public final class FigureOperations {
  private FigureOperations() {}

  private static final ObjectMapper JSON = new ObjectMapper();

  private record Spec(
      String name, String label, Map<String, JsonNode> fields, List<String> required) {}

  private static JsonNode schema(String text) {
    try {
      return JSON.readTree(text);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private static final JsonNode BOOL = schema("{\"type\":\"boolean\"}");
  private static final JsonNode TEXT = schema("{\"type\":\"string\",\"maxLength\":500}");
  private static final JsonNode COLOR =
      schema("{\"type\":\"string\",\"pattern\":\"^#[0-9a-fA-F]{6}$\"}");
  private static final JsonNode SERIES_ID =
      schema("{\"type\":\"string\",\"minLength\":1,\"maxLength\":80}");
  private static final JsonNode COLUMN =
      schema("{\"type\":\"string\",\"minLength\":1,\"maxLength\":120}");
  private static final JsonNode OPTIONAL_COLUMN = schema("{\"type\":\"string\",\"maxLength\":120}");

  private static final String PRESENTATION = "presentation";
  private static final String STRUCTURE = "structure";
  private static final Set<String> STRUCTURAL =
      Set.of("set_chart", "set_mapping", "map_series", "add_series", "remove_series");
  private static final Map<String, String> CATEGORIES =
      Map.of(
          "set_style", PRESENTATION,
          "set_axis", PRESENTATION,
          "set_legend", PRESENTATION,
          "set_series", PRESENTATION,
          "set_canvas", PRESENTATION,
          "set_chart", STRUCTURE,
          "set_mapping", STRUCTURE,
          "map_series", STRUCTURE,
          "add_series", STRUCTURE,
          "remove_series", STRUCTURE);

  private static JsonNode number(double min, double max) {
    return JSON.createObjectNode().put("type", "number").put("minimum", min).put("maximum", max);
  }

  private static JsonNode enumeration(String... values) {
    var node = JSON.createObjectNode().put("type", "string");
    var array = node.putArray("enum");
    for (String v : values) array.add(v);
    return node;
  }

  private static final List<Spec> SPECS =
      List.of(
          new Spec(
              "set_style",
              "文字与字体",
              Map.of(
                  "title",
                  TEXT,
                  "font",
                  enumeration(
                      "Arial",
                      "Helvetica",
                      "Times New Roman",
                      "Georgia",
                      "Courier New",
                      "Noto Sans SC"),
                  "fontSize",
                  number(8, 40),
                  "fontPt",
                  number(4, 24),
                  "bold",
                  BOOL),
              List.of()),
          new Spec(
              "set_axis",
              "坐标轴",
              Map.of(
                  "axis",
                  enumeration("x", "y"),
                  "title",
                  TEXT,
                  "min",
                  schema("{\"type\":[\"number\",\"null\"]}"),
                  "max",
                  schema("{\"type\":[\"number\",\"null\"]}"),
                  "dtick",
                  schema("{\"type\":[\"number\",\"null\"],\"exclusiveMinimum\":0}"),
                  "log",
                  BOOL,
                  "grid",
                  BOOL),
              List.of("axis")),
          new Spec(
              "set_legend",
              "图例",
              Map.of(
                  "show",
                  BOOL,
                  "position",
                  enumeration("top", "bottom", "right"),
                  "orientation",
                  enumeration("h", "v")),
              List.of()),
          new Spec(
              "set_series",
              "序列外观",
              Map.of(
                  "seriesId",
                  SERIES_ID,
                  "name",
                  TEXT,
                  "color",
                  COLOR,
                  "opacity",
                  number(.1, 1),
                  "width",
                  number(.5, 10),
                  "dash",
                  enumeration("solid", "dash", "dot", "dashdot"),
                  "symbol",
                  enumeration("circle", "square", "diamond", "triangle-up", "cross", "x"),
                  "size",
                  number(0, 30),
                  "visible",
                  BOOL),
              List.of("seriesId")),
          new Spec(
              "set_canvas",
              "画布",
              Map.of(
                  "width",
                  schema("{\"type\":\"integer\",\"minimum\":250,\"maximum\":2400}"),
                  "height",
                  schema("{\"type\":\"integer\",\"minimum\":250,\"maximum\":2400}"),
                  "top",
                  number(0, 300),
                  "bottom",
                  number(0, 300),
                  "left",
                  number(0, 300),
                  "right",
                  number(0, 300),
                  "background",
                  COLOR),
              List.of()),
          new Spec(
              "set_chart",
              "图表类型",
              Map.of(
                  "type",
                  enumeration(
                      "line",
                      "bar",
                      "scatter",
                      "heatmap",
                      "box",
                      "violin",
                      "histogram",
                      "ecdf",
                      "roc",
                      "pr",
                      "confusion")),
              List.of("type")),
          new Spec(
              "set_mapping",
              "字段映射",
              Map.of("x", COLUMN, "group", OPTIONAL_COLUMN, "heatY", COLUMN, "heatZ", COLUMN),
              List.of()),
          new Spec(
              "map_series",
              "序列取数",
              Map.of("seriesId", SERIES_ID, "y", COLUMN, "error", OPTIONAL_COLUMN),
              List.of("seriesId", "y")),
          new Spec(
              "add_series",
              "新增序列",
              Map.of("id", SERIES_ID, "y", COLUMN, "name", TEXT, "error", OPTIONAL_COLUMN),
              List.of("id", "y")),
          new Spec(
              "remove_series",
              "删除序列",
              Map.of("seriesId", SERIES_ID),
              List.of("seriesId")));

  public static ObjectNode catalog() {
    var result = JSON.createObjectNode().put("protocol_version", 1).put("config_schema_version", 1);
    result.put("execution", "preview-only");
    var categories = result.putArray("categories");
    categories.addObject().put("id", PRESENTATION).put("label", "外观");
    categories.addObject().put("id", STRUCTURE).put("label", "结构");
    var tools = result.putArray("tools");
    for (var spec : SPECS) {
      var tool =
          tools
              .addObject()
              .put("name", spec.name())
              .put("label", spec.label())
              .put("category", CATEGORIES.getOrDefault(spec.name(), PRESENTATION));
      var input =
          tool.putObject("input_schema").put("type", "object").put("additionalProperties", false);
      input.put("minProperties", minProperties(spec));
      var properties = input.putObject("properties");
      spec.fields().entrySet().stream()
          .sorted(Map.Entry.comparingByKey())
          .forEach(e -> properties.set(e.getKey(), e.getValue().deepCopy()));
      var required = input.putArray("required");
      spec.required().forEach(required::add);
    }
    // Read tools are not operations: they answer questions and never enter a preview batch.
    var readTools = result.putArray("read_tools");
    readTools
        .addObject()
        .put("name", "get_figure_spec")
        .put("label", "图型规范")
        .put("category", "read")
        .put("method", "GET")
        .put("endpoint", "/api/figure-tools/spec");
    readTools
        .addObject()
        .put("name", "lint_figure")
        .put("label", "配置校验")
        .put("category", "read")
        .put("method", "POST")
        .put("endpoint", "/api/projects/{project}/figure-tools/lint");
    readTools
        .addObject()
        .put("name", "get_dataset_profile")
        .put("label", "数据画像")
        .put("category", "read")
        .put("method", "GET")
        .put("endpoint", "/api/projects/{project}/data/{datasetVersion}/profile");
    return result;
  }

  private static void require(boolean value, String message) {
    if (!value) throw ApiException.bad("绘图操作：" + message);
  }

  /** 目标标识本身不算调整：这些工具至少要再带一项属性。 */
  private static int minProperties(Spec spec) {
    boolean identityOnly = Set.of("set_axis", "set_series").contains(spec.name());
    return Math.max(1, spec.required().size() + (identityOnly ? 1 : 0));
  }

  private static void keys(JsonNode node, Set<String> allowed) {
    require(node != null && node.isObject(), "需要 JSON 对象");
    node.fieldNames().forEachRemaining(key -> require(allowed.contains(key), "不支持字段 " + key));
  }

  private static void validateValue(String key, JsonNode value, JsonNode rule) {
    if (value.isNull()) {
      require(rule.path("type").isArray(), key + " 不允许为空");
      return;
    }
    String type = rule.path("type").isArray() ? "number" : rule.path("type").asText();
    switch (type) {
      case "boolean" -> require(value.isBoolean(), key + " 需要布尔值");
      case "string" -> {
        require(value.isTextual(), key + " 需要文本");
        require(
            value.asText().length() >= rule.path("minLength").asInt(0)
                && value.asText().length() <= rule.path("maxLength").asInt(500),
            key + " 长度无效");
        if (rule.has("enum")) {
          boolean found = false;
          for (var option : rule.path("enum")) found |= option.equals(value);
          require(found, key + " 选项无效");
        }
        if (rule.has("pattern"))
          require(value.asText().matches(rule.path("pattern").asText()), key + " 格式无效");
      }
      case "number", "integer" -> {
        require(value.isNumber() && Double.isFinite(value.asDouble()), key + " 需要有限数值");
        if (type.equals("integer")) require(value.isIntegralNumber(), key + " 需要整数");
        if (rule.has("minimum"))
          require(value.asDouble() >= rule.path("minimum").asDouble(), key + " 小于下限");
        if (rule.has("maximum"))
          require(value.asDouble() <= rule.path("maximum").asDouble(), key + " 超过上限");
        if (rule.has("exclusiveMinimum"))
          require(value.asDouble() > rule.path("exclusiveMinimum").asDouble(), key + " 须大于零");
      }
      default -> throw ApiException.bad("不支持的参数类型");
    }
  }

  public static ObjectNode apply(JsonNode original, JsonNode operations) {
    require(
        original != null
            && original.path("schema_version").isIntegralNumber()
            && original.path("schema_version").canConvertToInt()
            && original.path("schema_version").asInt() == 1,
        "不支持的图表 schema_version");
    ConfigValidator.validate(original);
    require(
        operations != null
            && operations.isArray()
            && !operations.isEmpty()
            && operations.size() <= 30,
        "一次需要 1–30 项操作");
    ObjectNode result = original.deepCopy();
    for (var operation : operations) {
      keys(operation, Set.of("tool", "arguments"));
      require(operation.path("tool").isTextual(), "缺少工具名称");
      var spec =
          SPECS.stream()
              .filter(s -> s.name().equals(operation.path("tool").asText()))
              .findFirst()
              .orElseThrow(() -> ApiException.bad("不支持的绘图工具"));
      var args = operation.path("arguments");
      keys(args, spec.fields().keySet());
      require(args.size() >= minProperties(spec), "操作不能只有目标标识");
      spec.required().forEach(key -> require(args.has(key), "缺少 " + key));
      args.fields()
          .forEachRemaining(
              e -> validateValue(e.getKey(), e.getValue(), spec.fields().get(e.getKey())));
      String type = result.path("type").asText();
      boolean matrix = Set.of("heatmap", "confusion").contains(type);
      if (matrix && Set.of("set_series", "set_legend").contains(spec.name()))
        throw ApiException.bad("矩阵图请使用专业属性调整色阶，不支持序列或图例工具");
      if (spec.name().equals("set_axis")) {
        String axis = args.path("axis").asText();
        boolean fixed =
            matrix
                || Set.of("roc", "pr").contains(type)
                || (Set.of("box", "violin").contains(type) && axis.equals("x"))
                || !result.path("facet").path("mode").asText("none").equals("none");
        if (fixed)
          for (String field : List.of("min", "max", "dtick", "log"))
            require(!args.has(field), "当前图表的该坐标轴由图形结构固定，不支持范围、刻度或对数操作");
        require(!matrix || !args.has("grid"), "矩阵图网格由单元格结构决定");
      }
      if (spec.name().equals("set_series")) {
        require(!Set.of("bar", "histogram").contains(type) || !args.has("size"), "当前图表不使用点大小");
        require(!Set.of("bar", "histogram").contains(type) || !args.has("symbol"), "当前图表不使用点形状");
        require(
            !Set.of("bar", "histogram", "scatter").contains(type) || !args.has("width"),
            "当前图表不使用序列线宽");
        require(
            Set.of("line", "roc", "pr", "ecdf").contains(type) || !args.has("dash"),
            "当前图表不使用序列虚实线");
      }
      if (STRUCTURAL.contains(spec.name())) {
        applyStructural(result, spec.name(), args);
        continue;
      }
      ObjectNode target;
      switch (spec.name()) {
        case "set_axis" ->
            target = (ObjectNode) result.path("axes").path(args.path("axis").asText());
        case "set_legend" -> target = (ObjectNode) result.path("legend");
        case "set_series" -> {
          JsonNode found = null;
          for (var series : result.path("series"))
            if (series.path("id").asText().equals(args.path("seriesId").asText())) found = series;
          require(found != null, "序列 ID 不存在");
          target = (ObjectNode) found;
        }
        default -> target = (ObjectNode) result.path("style");
      }
      if (spec.name().equals("set_style")) {
        boolean physical = result.path("publication").path("enabled").asBoolean();
        require(!args.has("fontSize") || !physical, "论文尺寸模式请使用 fontPt 调整成品字号");
        require(!args.has("fontPt") || physical, "fontPt 仅用于已开启的论文尺寸模式");
      }
      final var destination = target;
      args.fields()
          .forEachRemaining(
              e -> {
                String key = e.getKey();
                JsonNode value = e.getValue();
                if (key.equals("axis") || key.equals("seriesId")) return;
                if (spec.name().equals("set_axis") && key.equals("title")) {
                  String axis = args.path("axis").asText();
                  if (Set.of("roc", "pr").contains(type)) {
                    ((ObjectNode) result.path("evaluation"))
                        .set(type + axis.toUpperCase() + "Title", value.deepCopy());
                    return;
                  }
                  if (type.equals("confusion")) {
                    ((ObjectNode) result.path("classification"))
                        .set(axis + "Title", value.deepCopy());
                    return;
                  }
                  if (Set.of("histogram", "ecdf").contains(type)) {
                    require(result.path("empirical").isObject(), "请先在专业属性中设置分布图轴标题");
                    ((ObjectNode) result.path("empirical"))
                        .set(axis.equals("x") ? "valueTitle" : "resultTitle", value.deepCopy());
                    return;
                  }
                }
                if (key.equals("fontPt")) {
                  ((ObjectNode) result.path("publication")).set(key, value.deepCopy());
                  return;
                }
                if (spec.name().equals("set_axis") && Set.of("min", "max", "dtick").contains(key))
                  destination.put(key, value.isNull() ? "" : value.asText());
                else destination.set(key, value.deepCopy());
              });
    }
    ConfigValidator.validate(result);
    for (String axis : List.of("x", "y")) {
      String chartType = result.path("type").asText();
      if (Set.of("heatmap", "confusion", "roc", "pr").contains(chartType)
          || (Set.of("box", "violin").contains(chartType) && axis.equals("x"))
          || !result.path("facet").path("mode").asText("none").equals("none")) continue;
      var a = result.path("axes").path(axis);
      Double low = axisNumber(a.path("min")),
          high = axisNumber(a.path("max")),
          tick = axisNumber(a.path("dtick"));
      require(low == null || high == null || low < high, axis + " 轴最小值必须小于最大值");
      require(tick == null || tick > 0, axis + " 轴刻度须大于零");
      require(
          !a.path("log").asBoolean() || ((low == null || low > 0) && (high == null || high > 0)),
          "对数轴范围必须为正数");
    }
    var s = result.path("style");
    require(
        s.path("left").asDouble() + s.path("right").asDouble() < s.path("width").asDouble()
            && s.path("top").asDouble() + s.path("bottom").asDouble() < s.path("height").asDouble(),
        "边距不能覆盖整个画布");
    return result;
  }

  /**
   * Structural operations change which columns the figure reads. They never invent professional
   * configuration (evaluation, classification) and never rename or duplicate a series silently.
   */
  private static void applyStructural(ObjectNode result, String tool, JsonNode args) {
    switch (tool) {
      case "set_chart" -> {
        String next = args.path("type").asText();
        if (next.equals("heatmap"))
          require(
              !result.path("heatY").asText("").isBlank()
                  && !result.path("heatZ").asText("").isBlank(),
              "切换为热力图前，请先用字段映射指定 Y 分类列与 Z 数值列");
        if (Set.of("roc", "pr").contains(next))
          require(result.path("evaluation").isObject(), "切换为 ROC/PR 前，请先完成评估配置");
        if (next.equals("confusion"))
          require(result.path("classification").isObject(), "切换为混淆矩阵前，请先完成分类配置");
        result.put("type", next);
      }
      case "set_mapping" -> {
        String chartType = result.path("type").asText();
        if (args.has("x")) {
          require(
              !Set.of("histogram", "ecdf", "roc", "pr", "confusion").contains(chartType),
              "当前图表的 X 轴由图形结构决定，不能改映射");
          result.put("x", args.get("x").asText());
        }
        if (args.has("group")) result.put("group", args.get("group").asText());
        for (String key : List.of("heatY", "heatZ"))
          if (args.has(key)) result.put(key, args.get(key).asText());
      }
      case "map_series" -> {
        ObjectNode series = series(result, args.path("seriesId").asText());
        if (args.has("y")) series.put("y", args.get("y").asText());
        if (args.has("error")) series.put("error", args.get("error").asText());
      }
      case "add_series" -> {
        String id = args.path("id").asText();
        var series = (ArrayNode) result.path("series");
        require(series.size() < 20, "序列最多 20 条");
        for (JsonNode existing : series)
          require(!existing.path("id").asText().equals(id), "序列 ID 已存在");
        ObjectNode added = series.get(0).deepCopy();
        added.put("id", id);
        added.put("y", args.path("y").asText());
        added.put("name", args.has("name") ? args.get("name").asText() : args.path("y").asText());
        added.put("error", args.path("error").asText(""));
        added.put("visible", true);
        if (added.path("band").isObject()) ((ObjectNode) added.path("band")).put("enabled", false);
        added.remove("prediction");
        series.add(added);
      }
      default -> {
        String id = args.path("seriesId").asText();
        require(
            !id.equals(result.path("classification").path("seriesId").asText("")),
            "该序列被分类评估配置引用，请先调整评估配置");
        var series = (ArrayNode) result.path("series");
        require(series.size() > 1, "至少保留一条序列");
        int index = -1;
        for (int i = 0; i < series.size(); i++)
          if (series.get(i).path("id").asText().equals(id)) index = i;
        require(index >= 0, "序列 ID 不存在");
        series.remove(index);
      }
    }
  }

  private static ObjectNode series(ObjectNode result, String id) {
    for (JsonNode item : result.path("series"))
      if (item.path("id").asText().equals(id)) return (ObjectNode) item;
    throw ApiException.bad("绘图操作：序列 ID 不存在");
  }

  private static Double axisNumber(JsonNode n) {
    if (n.asText().isBlank()) return null;
    try {
      double v = Double.parseDouble(n.asText());
      require(Double.isFinite(v), "坐标范围须为有限数值");
      return v;
    } catch (NumberFormatException e) {
      throw ApiException.bad("坐标范围须为数值或留空");
    }
  }

  public static ArrayNode changes(JsonNode before, JsonNode after) {
    var changes = JSON.createArrayNode();
    diff(before, after, "", changes);
    return changes;
  }

  private static void diff(JsonNode before, JsonNode after, String path, ArrayNode changes) {
    if (before.equals(after)) return;
    if (before.isObject() && after.isObject()) {
      var keys = new TreeSet<String>();
      before.fieldNames().forEachRemaining(keys::add);
      after.fieldNames().forEachRemaining(keys::add);
      for (String key : keys)
        diff(
            before.path(key),
            after.path(key),
            path + "/" + key.replace("~", "~0").replace("/", "~1"),
            changes);
    } else if (before.isArray() && after.isArray() && before.size() == after.size()) {
      for (int i = 0; i < before.size(); i++)
        diff(before.get(i), after.get(i), path + "/" + i, changes);
    } else {
      var change = changes.addObject().put("path", path);
      change.set("before", before.deepCopy());
      change.set("after", after.deepCopy());
    }
  }
}
