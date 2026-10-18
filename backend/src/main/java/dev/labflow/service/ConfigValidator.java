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

  public static void validate(JsonNode c) {
    require(c.isObject(), "必须是 JSON 对象");
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
  }
}
