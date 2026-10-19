package dev.labflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.api.ApiException;
import java.util.*;

/**
 * Shape and range checks for the persisted v1 editor contract. Unknown additive keys are preserved.
 */
public final class ConfigValidator {
  private ConfigValidator() {}

  private static void require(boolean valid, String message) {
    if (!valid) throw ApiException.bad("图表配置：" + message);
  }

  private static void number(JsonNode n, double min, double max, String name) {
    require(
        n.isNumber() && Double.isFinite(n.asDouble()) && n.asDouble() >= min && n.asDouble() <= max,
        name + " 超出范围");
  }

  private static void text(JsonNode n, int max, String name) {
    require(n.isTextual() && n.asText().length() <= max, name + " 无效");
  }

  private static void color(JsonNode n) {
    require(n.asText().matches("#[0-9a-fA-F]{6}"), "颜色必须是 HEX");
  }

  private static Double optionalNumber(JsonNode n, String name) {
    text(n, 120, name);
    if (n.asText().isBlank()) return null;
    try {
      double value = Double.parseDouble(n.asText().trim());
      require(Double.isFinite(value), name + " 必须为有限数值");
      return value;
    } catch (NumberFormatException e) {
      throw ApiException.bad(name + " 必须为数值或留空");
    }
  }

  public static void validate(JsonNode c) {
    require(c.isObject(), "必须是 JSON 对象");
    require(
        Set.of("line", "bar", "scatter", "heatmap", "box", "violin", "histogram", "ecdf")
            .contains(c.path("type").asText()),
        "图表类型无效");
    require(
        c.path("datasetVersionId").canConvertToLong() && c.path("datasetVersionId").asLong() > 0,
        "缺少数据版本");
    for (String key : List.of("x", "group", "heatY", "heatZ")) text(c.path(key), 120, key);
    var style = c.path("style");
    text(style.path("title"), 500, "标题");
    text(style.path("preset"), 80, "预设");
    require(
        Set.of("Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New")
            .contains(style.path("font").asText()),
        "字体不受支持");
    number(style.path("fontSize"), 8, 40, "字号");
    require(style.path("bold").isBoolean(), "字重无效");
    color(style.path("background"));
    for (String k : List.of("width", "height")) number(style.path(k), 250, 2400, k);
    for (String k : List.of("top", "bottom", "left", "right")) number(style.path(k), 0, 300, k);
    var axes = c.path("axes");
    for (String k : List.of("x", "y")) {
      var a = axes.path(k);
      require(a.isObject(), "缺少坐标轴");
      text(a.path("title"), 500, "轴标题");
      require(a.path("log").isBoolean() && a.path("grid").isBoolean(), "坐标轴开关无效");
      for (String v : List.of("min", "max", "dtick")) text(a.path(v), 120, "轴范围");
    }
    var legend = c.path("legend");
    require(
        legend.path("show").isBoolean()
            && Set.of("top", "bottom", "right").contains(legend.path("position").asText())
            && Set.of("h", "v").contains(legend.path("orientation").asText()),
        "图例无效");
    require(
        c.path("series").isArray() && !c.path("series").isEmpty() && c.path("series").size() <= 20,
        "序列数量无效");
    Set<String> ids = new HashSet<>();
    for (var s : c.path("series")) {
      text(s.path("id"), 80, "序列 ID");
      require(!s.path("id").asText().isBlank() && ids.add(s.path("id").asText()), "序列 ID 必须唯一");
      text(s.path("name"), 500, "序列名称");
      text(s.path("y"), 120, "Y 字段");
      text(s.path("error"), 120, "误差字段");
      color(s.path("color"));
      number(s.path("opacity"), 0.1, 1, "透明度");
      number(s.path("width"), 0.5, 10, "线宽");
      number(s.path("size"), 0, 30, "点大小");
      require(s.path("visible").isBoolean(), "序列可见性无效");
      require(Set.of("solid", "dash", "dot", "dashdot").contains(s.path("dash").asText()), "线型无效");
      require(
          Set.of("circle", "square", "diamond", "triangle-up", "cross", "x")
              .contains(s.path("symbol").asText()),
          "点形状无效");
    }
    require(c.path("annotations").isArray() && c.path("annotations").size() <= 100, "注释列表无效");
    for (var a : c.path("annotations")) {
      text(a.path("id"), 80, "注释 ID");
      text(a.path("text"), 500, "注释");
      number(a.path("x"), 0, 1, "注释 X");
      number(a.path("y"), 0, 1, "注释 Y");
    }
    require(c.path("transforms").isArray() && c.path("transforms").size() <= 100, "转换列表无效");
    for (var t : c.path("transforms")) text(t.path("value"), 500, "过滤值");
    if (c.has("publication")) {
      var p = c.path("publication");
      require(p.isObject() && p.path("enabled").isBoolean(), "物理尺寸配置无效");
      number(p.path("widthMm"), 50, 300, "成品宽度");
      number(p.path("fontPt"), 4, 24, "成品字号");
      number(p.path("dpi"), 72, 1200, "DPI");
    }
    if (c.has("empirical")) {
      var e = c.path("empirical");
      require(e.isObject() && e.path("bins").isIntegralNumber(), "分箱数量必须为整数");
      number(e.path("bins"), 1, 200, "分箱数量");
      var start = optionalNumber(e.path("start"), "分箱起点");
      var end = optionalNumber(e.path("end"), "分箱终点");
      require(start == null || end == null || start < end, "分箱起点必须小于终点");
      require(
          Set.of("count", "probability", "density").contains(e.path("normalization").asText()),
          "直方图纵轴无效");
      text(e.path("valueTitle"), 120, "观测轴标题");
      text(e.path("resultTitle"), 120, "分布轴标题");
    }
    if (c.has("heatmap")) {
      var h = c.path("heatmap");
      require(h.isObject() && h.path("labels").isBoolean(), "热力图配置无效");
      require(
          Set.of("series", "viridis", "cividis", "blueRed").contains(h.path("palette").asText()),
          "热力图色阶无效");
      var min = optionalNumber(h.path("min"), "色阶最小值");
      var max = optionalNumber(h.path("max"), "色阶最大值");
      var center = optionalNumber(h.path("center"), "色阶中心值");
      require(min == null || max == null || min < max, "色阶最小值必须小于最大值");
      require(
          center == null || ((min == null || min < center) && (max == null || center < max)),
          "色阶中心值须在范围内");
    }
    if (c.has("distribution")) {
      var d = c.path("distribution");
      require(d.isObject(), "分布配置无效");
      require(Set.of("all", "outliers", "none").contains(d.path("points").asText()), "观测点模式无效");
      require(
          Set.of("linear", "exclusive", "inclusive").contains(d.path("quartileMethod").asText()),
          "四分位算法无效");
      require(d.path("mean").isBoolean() && d.path("innerBox").isBoolean(), "分布开关无效");
      require(Set.of("hard", "soft").contains(d.path("span").asText()), "密度边界无效");
      text(d.path("bandwidth"), 120, "带宽");
      var bandwidth = d.path("bandwidth").asText().trim();
      if (!bandwidth.isEmpty()) {
        double value;
        try {
          value = Double.parseDouble(bandwidth);
        } catch (NumberFormatException e) {
          throw ApiException.bad("密度带宽必须是正数或留空");
        }
        require(Double.isFinite(value) && value > 0, "密度带宽必须是有限正数");
      }
    }
    if (c.has("facet")) {
      var f = c.path("facet");
      require(f.isObject(), "分面配置无效");
      require(Set.of("none", "series", "field").contains(f.path("mode").asText()), "分面方式无效");
      text(f.path("field"), 120, "分面字段");
      require(f.path("columns").isIntegralNumber(), "子图列数必须为整数");
      number(f.path("columns"), 1, 3, "子图列数");
      number(f.path("gapX"), 24, 200, "水平间距");
      number(f.path("gapY"), 40, 200, "垂直间距");
      require(
          f.path("shareX").isBoolean()
              && f.path("shareY").isBoolean()
              && f.path("labels").isBoolean(),
          "分面开关无效");
      var titles = f.path("titles");
      require(titles.isObject() && titles.size() <= 100, "子图标题数量无效");
      for (var it = titles.fields(); it.hasNext(); ) {
        var title = it.next();
        require(title.getKey().length() <= 500, "子图键过长");
        text(title.getValue(), 300, "子图标题");
      }
    }
  }
}
