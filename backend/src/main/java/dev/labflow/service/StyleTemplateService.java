package dev.labflow.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.WorkspaceRepository;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class StyleTemplateService {
  private final WorkspaceRepository db;
  private final ObjectMapper json;
  private final WorkspaceService workspace;

  public StyleTemplateService(
      WorkspaceRepository db, ObjectMapper json, WorkspaceService workspace) {
    this.db = db;
    this.json = json;
    this.workspace = workspace;
  }

  static ObjectNode pick(JsonNode source, String... keys) {
    var result = JsonNodeFactory.instance.objectNode();
    for (String key : keys) if (source.has(key)) result.set(key, source.get(key).deepCopy());
    return result;
  }

  public static ObjectNode profile(JsonNode c) {
    if (c == null || c.path("schema_version").asInt() != 1) throw ApiException.bad("不支持的图表配置");
    ConfigValidator.validate(c);
    var p = JsonNodeFactory.instance.objectNode().put("schema_version", 1);
    p.set(
        "style",
        pick(
            c.path("style"),
            "font",
            "fontSize",
            "bold",
            "background",
            "width",
            "height",
            "top",
            "bottom",
            "left",
            "right",
            "preset"));
    var axes = p.putObject("axes");
    for (String key : List.of("x", "y")) axes.set(key, pick(c.path("axes").path(key), "grid"));
    p.set("legend", pick(c.path("legend"), "show", "position", "orientation"));
    if (c.has("publication"))
      p.set("publication", pick(c.get("publication"), "enabled", "widthMm", "fontPt", "dpi"));
    if (c.has("heatmap")) p.set("heatmap", pick(c.get("heatmap"), "palette", "labels"));
    var series = p.putArray("series");
    for (var s : c.path("series")) {
      var a = pick(s, "color", "opacity", "width", "dash", "symbol", "size");
      if (s.has("band")) a.set("band", pick(s.get("band"), "opacity"));
      series.add(a);
    }
    return p;
  }

  /**
   * Validate imported profiles using the same ranges as an actual chart, then enforce whitelist.
   */
  public static void validateProfile(JsonNode p) {
    try {
      var c =
          (ObjectNode)
              new ObjectMapper()
                  .readTree(
                      """
{"schema_version":1,"datasetVersionId":1,"type":"line","x":"x","group":"","heatY":"","heatZ":"","axes":{"x":{"title":"","min":"","max":"","dtick":"","log":false,"grid":false},"y":{"title":"","min":"","max":"","dtick":"","log":false,"grid":false}},"annotations":[],"transforms":[]}
""");
      var style = (ObjectNode) p.path("style").deepCopy();
      style.put("title", "");
      c.set("style", style);
      for (String key : List.of("x", "y"))
        ((ObjectNode) c.path("axes").path(key)).set("grid", p.path("axes").path(key).path("grid"));
      c.set("legend", p.path("legend"));
      if (p.has("publication")) c.set("publication", p.get("publication"));
      if (p.has("heatmap")) {
        var h = (ObjectNode) p.get("heatmap").deepCopy();
        h.put("min", "").put("max", "").put("center", "");
        c.set("heatmap", h);
      }
      var series = c.putArray("series");
      int i = 0;
      for (var a : p.path("series")) {
        var s = (ObjectNode) a.deepCopy();
        s.put("id", "s" + i++).put("y", "y").put("name", "").put("error", "").put("visible", true);
        if (s.has("band"))
          ((ObjectNode) s.get("band"))
              .put("enabled", false)
              .put("lower", "")
              .put("upper", "")
              .put("label", "");
        series.add(s);
      }
      if (!profile(c).equals(p)) throw ApiException.bad("样式模板包含非外观字段或缺少必要字段");
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw ApiException.bad("样式模板结构无效");
    }
  }

  public List<Map<String, Object>> list() {
    return db
        .query(
            "SELECT t.*,p.name project_name FROM style_templates t JOIN projects p ON"
                + " p.id=t.project_id ORDER BY t.id DESC")
        .stream()
        .map(
            row -> {
              var r = new LinkedHashMap<>(row);
              try {
                r.put("profile", json.readTree(r.remove("profile_json").toString()));
              } catch (Exception e) {
                throw new IllegalStateException(e);
              }
              return (Map<String, Object>) r;
            })
        .toList();
  }

  public Object save(long p, String name, JsonNode config) {
    workspace.project(p);
    var profile = profile(config);
    long id =
        db.insert(
            "INSERT INTO style_templates(project_id,name,profile_json) VALUES(?,?,?)",
            p,
            name.trim(),
            profile.toString());
    return Map.of("id", id, "name", name.trim(), "profile", profile);
  }

  public Object delete(long id) {
    if (db.update("DELETE FROM style_templates WHERE id=?", id) != 1)
      throw new ApiException(404, "样式模板不存在");
    return Map.of("deleted", id);
  }
}
