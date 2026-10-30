package dev.labflow.review;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import java.util.stream.*;

public record ReviewContext(JsonNode config, JsonNode facts, JsonNode journal, double widthMm,
    JsonNode sourceMeta, List<OtherChart> otherCharts) {
  public record OtherChart(String name, JsonNode config) {}
  public double points(double px) { return px * widthMm / config.path("style").path("width").asDouble() * 72 / 25.4; }
  public double pixels(double pt) { return pt / 72 * 25.4 / widthMm * config.path("style").path("width").asDouble(); }
  public boolean physical() { return config.path("publication").path("enabled").asBoolean(); }
  public double baseFontPx() {
    return physical() ? pixels(config.path("publication").path("fontPt").asDouble())
        : config.path("style").path("fontSize").asDouble();
  }
  public double minFont() { return journal.path("min_font_pt").isNumber() ? journal.path("min_font_pt").asDouble() : 6; }
  public double minLine() { return journal.path("min_line_pt").isNumber() ? journal.path("min_line_pt").asDouble() : .5; }
  public List<JsonNode> series() { return StreamSupport.stream(config.path("series").spliterator(), false).filter(s -> s.path("visible").asBoolean()).toList(); }
  public static String axisTitle(JsonNode config, String axis) {
    String type = config.path("type").asText();
    if (Set.of("roc", "pr").contains(type)) return config.path("evaluation").path(type + axis.toUpperCase() + "Title").asText();
    if (type.equals("confusion")) return config.path("classification").path(axis + "Title").asText();
    if (Set.of("histogram", "ecdf").contains(type)) return config.path("empirical").path(axis.equals("x") ? "valueTitle" : "resultTitle").asText();
    return config.path("axes").path(axis).path("title").asText();
  }
}
