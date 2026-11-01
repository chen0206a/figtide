package dev.labflow.diagram;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.api.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Schema v1 boundary. Pure validation: no filesystem, network, or database access. */
public final class DiagramValidator {
  public static final int MAX_BYTES = 2 * 1024 * 1024;
  public static final Set<String> PRESETS = Set.of("nature-flat", "soft-illustration", "line-minimal", "conference-framework", "isometric", "sketch");
  public static final Set<String> NODE_KINDS = Set.of("box", "pill", "ellipse", "glyph", "icon", "text");
  public static final Set<String> GLYPHS = Set.of("cell","vesicle","receptor","protein","dimer","ligand","small-molecule","dna","input-frames","encoder","llm","attention","tokens","layers","dataset","result-bars","result-bars-low","text-input","tube","flask","cell-cluster","laser","lens","beam-splitter","sample-stage","detector","energy-levels","phospho","frozen","trainable","number");
  public static final Set<String> ZONE_KINDS = Set.of("compartment", "membrane", "nucleus", "panel", "zoom");
  public static final Set<String> EDGE_KINDS = Set.of("flow", "activate", "inhibit", "transport", "bind", "indirect");
  public static final Set<String> ROLES = Set.of("actor", "process", "data", "model", "output", "note");
  private DiagramValidator() {}
  public static void require(boolean ok, String message) { if (!ok) throw ApiException.bad("机制图：" + message); }
  public static void fields(JsonNode n, String allowed, String required) {
    require(n != null && n.isObject(), "需要对象");
    var keys = Set.of(allowed.split(" "));
    n.fieldNames().forEachRemaining(k -> require(keys.contains(k), "未知字段 " + k));
    if (!required.isEmpty()) for (String k : required.split(" ")) require(n.has(k), "缺少 " + k);
  }
  public static double number(JsonNode n, double min, double max) {
    require(n != null && n.isNumber() && Double.isFinite(n.asDouble()) && n.asDouble() >= min && n.asDouble() <= max, "数值超出范围");
    return n.asDouble();
  }
  public static String text(JsonNode n, int max) {
    require(n != null && n.isTextual() && n.asText().codePointCount(0,n.asText().length()) <= max && n.asText().codePoints().noneMatch(c -> c < 32 && c != 10 && c != 9), "文字无效或过长");
    return n.asText();
  }
  public static String choice(JsonNode n, Set<String> choices) {
    String v = text(n, 64); require(choices.contains(v), "不支持的枚举值 " + v); return v;
  }
  public static void color(JsonNode n) { require(text(n, 7).matches("#[0-9a-fA-F]{6}"), "仅支持六位颜色"); }
  private static void array(JsonNode n, int max) { require(n != null && n.isArray() && n.size() <= max, "列表数量超限"); }
  private static String id(JsonNode n) { String s=text(n,64);require(s.matches("[A-Za-z][A-Za-z0-9_-]{0,63}"),"ID无效");return s; }
  private static void nullableText(JsonNode n,int max) { if (!n.isNull()) text(n,max); }
  private static void rect(JsonNode n,double width,double height) {
    double x=number(n.get("x"),0,width),y=number(n.get("y"),0,height);
    double w=number(n.get("w"),.1,width),h=number(n.get("h"),.1,height);
    require(x+w <= width+1e-8 && y+h <= height+1e-8,"元素超出画布");
  }
  public static void overrides(JsonNode n) {
    fields(n,"font_family font_size_pt line_width_pt radius_mm arrow fill shadow sketch iso zone_colors accent_colors text_color line_color","");
    n.fields().forEachRemaining(e -> {
      switch(e.getKey()) {
        case "font_family" -> choice(e.getValue(),Set.of("Arial, Helvetica, sans-serif","Inter, Arial, sans-serif","Noto Sans SC"));
        case "font_size_pt" -> number(e.getValue(),1,72);
        case "line_width_pt" -> number(e.getValue(),.1,12);
        case "radius_mm" -> number(e.getValue(),0,20);
        case "fill" -> choice(e.getValue(),Set.of("flat","soft","outline"));
        case "arrow" -> choice(e.getValue(),Set.of("open","filled"));
        case "shadow","sketch","iso" -> require(e.getValue().isBoolean(),"开关必须是布尔值");
        case "zone_colors","accent_colors" -> { array(e.getValue(),e.getKey().equals("zone_colors")?6:3); require(!e.getValue().isEmpty(),"调色板不能为空");for(var c:e.getValue())color(c); }
        default -> color(e.getValue());
      }
    });
  }
  public static void validate(JsonNode d) {
    fields(d,"schema_version canvas style label_language zones nodes edges annotations legend meta","schema_version canvas style label_language zones nodes edges annotations legend meta");
    require(d.path("schema_version").isIntegralNumber() && d.path("schema_version").canConvertToInt() && d.path("schema_version").asInt()==1,"不支持的schema_version");
    require(d.toString().getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES,"文档超过2MB");
    var canvas=d.path("canvas");fields(canvas,"width_mm height_mm background","width_mm height_mm background");
    double width=number(canvas.get("width_mm"),10,2000),height=number(canvas.get("height_mm"),10,2000);color(canvas.get("background"));
    var style=d.path("style");fields(style,"preset palette overrides","preset overrides");if(style.has("palette"))choice(style.get("palette"),Set.of("okabe-ito","npg","aaas","nejm","lancet","jama"));choice(style.get("preset"),PRESETS);overrides(style.path("overrides"));
    choice(d.get("label_language"),Set.of("en","zh"));
    array(d.get("zones"),30);array(d.get("nodes"),120);array(d.get("edges"),200);array(d.get("annotations"),120);
    Set<String> all=new HashSet<>(),zones=new HashSet<>(),nodes=new HashSet<>();
    for(String key:List.of("zones","nodes","edges","annotations"))for(var n:d.path(key)) {
      require(n.isObject(),"元素必须是对象");String ident=id(n.path("id"));require(all.add(ident),"ID重复");
      if(key.equals("zones"))zones.add(ident);if(key.equals("nodes"))nodes.add(ident);
    }
    for(var z:d.path("zones")) {
      fields(z,"id kind label x y w h zoom_of","id kind label x y w h zoom_of");choice(z.get("kind"),ZONE_KINDS);text(z.get("label"),200);rect(z,width,height);
      if(!z.path("zoom_of").isNull())require((zones.contains(id(z.get("zoom_of")))||nodes.contains(z.path("zoom_of").asText()))&&!z.get("zoom_of").equals(z.get("id")),"放大框引用无效");
    }
    for(var n:d.path("nodes")) {
      fields(n,"id kind x y w h label zone icon role style_ref glyph label_pos boxed badges","id kind x y w h label zone icon role style_ref");
      String kind=choice(n.get("kind"),NODE_KINDS);rect(n,width,height);text(n.get("label"),200);choice(n.get("role"),ROLES);
      if(kind.equals("glyph"))choice(n.get("glyph"),GLYPHS);
      else require(!n.hasNonNull("glyph"),"glyph只能用于科学图元节点");
      if(n.has("label_pos"))choice(n.get("label_pos"),Set.of("center","below","above","left","right"));
      if(n.has("boxed"))require(n.get("boxed").isBoolean(),"boxed必须是布尔值");
      if(n.has("badges")){array(n.get("badges"),8);Set<String> seen=new HashSet<>();for(var b:n.path("badges")){String badge=text(b,16);require(seen.add(badge)&&(Set.of("phospho","frozen","trainable").contains(badge)||badge.matches("number:([1-9]|[1-9][0-9])")),"图元标记无效或重复");}}
      if(!n.path("zone").isNull()) { require(zones.contains(id(n.get("zone"))),"分区引用无效");var z=find(d.path("zones"),n.path("zone").asText()); require(n.path("x").asDouble()>=z.path("x").asDouble() && n.path("y").asDouble()>=z.path("y").asDouble() && n.path("x").asDouble()+n.path("w").asDouble()<=z.path("x").asDouble()+z.path("w").asDouble()+1e-8 && n.path("y").asDouble()+n.path("h").asDouble()<=z.path("y").asDouble()+z.path("h").asDouble()+1e-8,"节点超出所属分区"); }
      if(kind.equals("icon"))choice(n.get("icon"),BuiltinIconIds.IDS);else require(n.path("icon").isNull(),"图标ID只能用于图标节点");
      if(!n.path("style_ref").isNull())choice(n.get("style_ref"),ROLES);
    }
    for(var e:d.path("edges")) {
      fields(e,"id from to kind label route","id from to kind label route");require(nodes.contains(id(e.get("from")))&&nodes.contains(id(e.get("to"))),"连线端点不存在");
      choice(e.get("kind"),EDGE_KINDS);choice(e.get("route"),Set.of("straight","orthogonal","curved"));text(e.get("label"),200);
    }
    for(var a:d.path("annotations")) {
      fields(a,"id kind target text","id kind target text");choice(a.get("kind"),Set.of("panel_letter","callout","note"));require(nodes.contains(id(a.get("target")))||zones.contains(a.path("target").asText()),"注释目标不存在");text(a.get("text"),200);
    }
    var legend=d.path("legend");fields(legend,"mode position","mode position");choice(legend.get("mode"),Set.of("auto","off"));choice(legend.get("position"),Set.of("bottom-right","bottom-left","top-right","top-left"));
    var meta=d.path("meta");fields(meta,"skill skill_version template brief facts source_text fact_sources ai_labels include_icon_attribution","skill skill_version template brief facts");
    for(String k:List.of("skill","skill_version","template"))nullableText(meta.get(k),120);text(meta.get("brief"),10000);array(meta.get("facts"),200);for(var f:meta.path("facts"))text(f,1000);
    if(meta.has("include_icon_attribution"))require(meta.get("include_icon_attribution").isBoolean(),"图标署名开关无效");
    if(meta.has("source_text"))text(meta.get("source_text"),10000);
    if(meta.has("fact_sources")){array(meta.get("fact_sources"),40);require(meta.path("fact_sources").size()==meta.path("facts").size(),"事实出处数量不一致");int index=0;for(var f:meta.path("fact_sources")){fields(f,"text quote","text quote");String quote=text(f.get("quote"),1000);require(!quote.isBlank()&&meta.path("source_text").asText().contains(quote)&&f.path("text").equals(meta.path("facts").get(index++)),"事实出处必须来自用户原文");}}
    if(meta.has("ai_labels")){array(meta.get("ai_labels"),120);Set<String> seen=new HashSet<>();for(var label:meta.path("ai_labels")){fields(label,"id label","id label");require(nodes.contains(id(label.get("id")))&&seen.add(label.path("id").asText()),"AI标签引用无效或重复");text(label.get("label"),200);}}
  }
  public static JsonNode find(JsonNode list,String id) { for(var n:list)if(n.path("id").asText().equals(id))return n;throw ApiException.bad("机制图：元素不存在"); }
}
