package dev.labflow.agent;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/**
 * Allowlisted audit representation, deliberately not a copy of model messages or dataset content.
 */
public final class AuditSanitizer {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Set<String> SAFE_STRINGS =
      Set.of(
          "x",
          "y",
          "top",
          "bottom",
          "right",
          "h",
          "v",
          "solid",
          "dash",
          "dot",
          "dashdot",
          "circle",
          "square",
          "diamond",
          "triangle-up",
          "cross",
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
          "confusion",
          "Arial",
          "Helvetica",
          "Times New Roman",
          "Georgia",
          "Courier New");
  private static final Set<String> ENUM_KEYS =
      Set.of("axis", "position", "orientation", "dash", "symbol", "type", "font");
  private static final Set<String> TOOLS =
      Set.of(
          "set_style",
          "set_axis",
          "set_legend",
          "set_series",
          "set_canvas",
          "set_chart",
          "set_mapping",
          "map_series",
          "add_series",
          "remove_series",
          "get_figure_spec",
          "get_dataset_profile",
          "lint_figure",
          "recommend_charts");

  private AuditSanitizer() {}

  public static String hash(JsonNode value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(canonical(value).toString().getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private static JsonNode canonical(JsonNode node) {
    if (node.isObject()) {
      var result = JSON.createObjectNode();
      var keys = new TreeSet<String>();
      node.fieldNames().forEachRemaining(keys::add);
      keys.forEach(k -> result.set(k, canonical(node.get(k))));
      return result;
    }
    if (node.isArray()) {
      var a = JSON.createArrayNode();
      node.forEach(v -> a.add(canonical(v)));
      return a;
    }
    return node;
  }

  public static ObjectNode hidden(JsonNode value) {
    return JSON.createObjectNode()
        .put("redacted", true)
        .put("sha256", hash(value))
        .put("chars", value.isTextual() ? value.asText().length() : value.toString().length());
  }

  public static String toolName(String name) {
    return TOOLS.contains(name) ? name : "unknown_tool";
  }

  public static JsonNode arguments(String tool, JsonNode args) {
    JsonNode spec = null;
    for (var t : dev.labflow.service.FigureOperations.catalog().path("tools"))
      if (t.path("name").asText().equals(tool)) spec = t.path("input_schema").path("properties");
    var result = JSON.createObjectNode();
    if (!args.isObject()) return hidden(args);
    if (spec == null && !TOOLS.contains(tool)) return hidden(args);
    int count = 0;
    var names = args.fieldNames();
    while (names.hasNext() && count++ < 24) {
      String key = names.next();
      boolean allowed =
          spec != null ? spec.has(key) : tool.equals("get_figure_spec") && key.equals("type");
      if (!allowed) {
        result.set("extra_arguments", hidden(args));
        continue;
      }
      result.set(key, scalar(key, args.get(key)));
    }
    if (names.hasNext()) result.put("truncated", true);
    return result;
  }

  private static JsonNode scalar(String key, JsonNode value) {
    if (value.isNull() || value.isBoolean() || value.isNumber()) return value.deepCopy();
    if (value.isTextual()
        && ((ENUM_KEYS.contains(key) && SAFE_STRINGS.contains(value.asText()))
            || (Set.of("color", "background").contains(key)
                && value.asText().matches("#[a-fA-F0-9]{6}")))) return value.deepCopy();
    return hidden(value);
  }

  public static JsonNode arguments(String tool, String encoded) {
    try {
      return arguments(tool, JSON.readTree(encoded));
    } catch (Exception e) {
      return hidden(JSON.getNodeFactory().textNode(encoded));
    }
  }

  public static JsonNode result(String tool, JsonNode node) {
    var out =
        JSON.createObjectNode().put("sha256", hash(node)).put("chars", node.toString().length());
    for (String key :
        List.of(
            "ok",
            "queued_operations",
            "dataset_version_id",
            "dataset_id",
            "version",
            "row_count",
            "base_revision",
            "protocol_version"))
      if (node.path(key).isBoolean() || node.path(key).isNumber()) out.set(key, node.get(key));
    if (node.has("message")) {
      out.set("message", hidden(node.get("message")));
      if (node.path("ok").isBoolean() && !node.path("ok").asBoolean())
        out.put("error_code", "batch_rejected");
    }
    if (node.path("fields").isArray()) {
      var fields = out.putArray("fields");
      int n = 0;
      for (var f : node.path("fields")) {
        if (n++ >= 80) {
          out.put("truncated", true);
          break;
        }
        var item = fields.addObject();
        item.set("name", hidden(f.path("name")));
        if (Set.of("number", "string").contains(f.path("type").asText()))
          item.put("type", f.path("type").asText());
        for (String k : List.of("missing", "unique", "constant"))
          if (f.path(k).isNumber() || f.path(k).isBoolean()) item.set(k, f.get(k));
      }
    }
    if (node.has("issues")) out.put("issue_count", node.path("issues").size());
    return out;
  }

  public static ObjectNode proposal(JsonNode proposal) {
    var out =
        JSON.createObjectNode()
            .put("operation_count", proposal.path("operation_count").asInt())
            .put("change_count", proposal.path("changes").size());
    out.set("source", proposal.path("source").deepCopy());
    var ops = out.putArray("operations");
    for (var op : proposal.path("operations")) {
      if (ops.size() == 30) {
        out.put("truncated", true);
        break;
      }
      var item = ops.addObject().put("tool", toolName(op.path("tool").asText()));
      item.set("arguments", arguments(op.path("tool").asText(), op.path("arguments")));
    }
    var changes = out.putArray("changes");
    for (var change : proposal.path("changes")) {
      if (changes.size() >= 200) {
        out.put("truncated", true);
        break;
      }
      var item = changes.addObject();
      String path = change.path("path").asText();
      // Unknown property names could themselves contain sensitive user text.
      if (path.matches(
              "/(style|axes/[xy]|legend|series/[0-9]+|publication|evaluation|classification|empirical)/[A-Za-z]+")
          || Set.of("/type", "/x", "/group", "/heatY", "/heatZ", "/series").contains(path))
        item.put("path", path);
      else item.set("path", hidden(change.path("path")));
      String field = path.substring(path.lastIndexOf('/') + 1);
      item.set("before", scalar(field, change.path("before")));
      item.set("after", scalar(field, change.path("after")));
    }
    return out;
  }

  /** Explicit user notes are readable, but credentials and the configured API key are scrubbed. */
  public static String note(String value) {
    return note(value, System.getenv().getOrDefault("LABFLOW_AGENT_API_KEY", ""));
  }

  static String note(String value, String secret) {
    if (secret != null && !secret.isBlank()) value = value.replace(secret, "[已脱敏]");
    value =
        value
            .replaceAll("(?i)bearer\\s+[^\\s,;]+", "Bearer [已脱敏]")
            .replaceAll(
                "(?i)[\"']?(api[_-]?key|token|password|secret)[\"']?\\s*[:=]\\s*[\"']?[^\\s,;\"'}]+",
                "$1=[已脱敏]")
            .replaceAll("(?i)(https?://)[^/@\\s]+:[^/@\\s]+@", "$1[已脱敏]@")
            .replaceAll("\\bsk-[A-Za-z0-9_-]{6,}", "[已脱敏]");
    return value.substring(0, Math.min(500, value.length()));
  }
}
