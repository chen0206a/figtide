package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import static dev.labflow.diagram.DiagramValidator.*;

/** Bounded immutable transformations. No paths, executable payloads, database or model I/O. */
public final class DiagramOperations {
  private static final ObjectMapper JSON=new ObjectMapper();
  private DiagramOperations(){}
  private record Spec(String name,String label,ObjectNode schema){}
  private static ObjectNode string(int max){return JSON.createObjectNode().put("type","string").put("maxLength",max);}
  private static ObjectNode number(double min,double max){return JSON.createObjectNode().put("type","number").put("minimum",min).put("maximum",max);}
  private static ObjectNode enumeration(Collection<String> values){var n=string(120);var a=n.putArray("enum");values.stream().sorted().forEach(a::add);return n;}
  private static ObjectNode enumeration(String... values){return enumeration(List.of(values));}
  private static ObjectNode nullable(ObjectNode n){var out=n.deepCopy();String type=out.path("type").asText();out.putArray("type").add(type).add("null");if(out.has("enum"))((ArrayNode)out.get("enum")).addNull();return out;}
  private static ObjectNode bool(){return JSON.createObjectNode().put("type","boolean");}
  private static Map<String,JsonNode> properties(Object... pairs){Map<String,JsonNode> m=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],(JsonNode)pairs[i+1]);return m;}
  private static ObjectNode object(Map<String,JsonNode> fields,List<String> required,int min){var n=JSON.createObjectNode().put("type","object").put("additionalProperties",false).put("minProperties",min);n.set("properties",JSON.valueToTree(fields));n.set("required",JSON.valueToTree(required));return n;}
  private static final ObjectNode ID=string(64).put("pattern","^[A-Za-z][A-Za-z0-9_-]{0,63}$");
  private static final ObjectNode COLOR=string(7).put("pattern","^#[0-9a-fA-F]{6}$");
  private static ObjectNode colors(int max){var n=JSON.createObjectNode().put("type","array").put("minItems",1).put("maxItems",max);n.set("items",COLOR);return n;}
  private static ObjectNode badges(){var n=JSON.createObjectNode().put("type","array").put("maxItems",8);n.set("items",string(16).put("pattern","^(phospho|frozen|trainable|number:([1-9]|[1-9][0-9]))$"));return n;}
  private static Map<String,JsonNode> rectFields(){return properties("x",number(0,2000),"y",number(0,2000),"w",number(.1,2000),"h",number(.1,2000));}
  private static Map<String,JsonNode> nodeFields(){var n=rectFields();n.putAll(properties("id",ID,"kind",enumeration(NODE_KINDS),"label",string(200),"zone",nullable(ID),"icon",nullable(enumeration(BuiltinIconIds.IDS)),"role",enumeration(ROLES),"style_ref",nullable(enumeration(ROLES)),"glyph",nullable(enumeration(GLYPHS)),"label_pos",enumeration("center","below","above","left","right"),"boxed",bool(),"badges",badges()));return n;}
  private static Map<String,JsonNode> zoneFields(){var n=rectFields();n.putAll(properties("id",ID,"kind",enumeration(ZONE_KINDS),"label",string(200),"zoom_of",nullable(ID)));return n;}
  private static Map<String,JsonNode> edgeFields(){return properties("id",ID,"from",ID,"to",ID,"kind",enumeration(EDGE_KINDS),"label",string(200),"route",enumeration("straight","orthogonal","curved"));}
  private static ObjectNode overrideSchema(){return nullable(object(properties("font_family",enumeration("Arial, Helvetica, sans-serif","Inter, Arial, sans-serif","Noto Sans SC"),"font_size_pt",number(1,72),"line_width_pt",number(.1,12),"radius_mm",number(0,20),"arrow",enumeration("open","filled"),"fill",enumeration("flat","soft","outline"),"shadow",bool(),"sketch",bool(),"iso",bool(),"zone_colors",colors(6),"accent_colors",colors(3),"text_color",COLOR,"line_color",COLOR),List.of(),0));}
  private static final List<Spec> SPECS=List.of(
      new Spec("add_zone","添加分区",object(zoneFields(),List.of("id","kind","label","x","y","w","h"),7)),
      new Spec("update_zone","修改分区（移动时包含节点一起移动）",object(zoneFields(),List.of("id"),2)),
      new Spec("add_node","添加节点",object(nodeFields(),List.of("id","kind","label","role","x","y","w","h"),8)),
      new Spec("update_node","修改节点",object(nodeFields(),List.of("id"),2)),
      new Spec("remove_node","移除节点及其连线/注释",object(properties("id",ID),List.of("id"),1)),
      new Spec("add_edge","添加连线",object(edgeFields(),List.of("id","from","to","kind"),4)),
      new Spec("update_edge","修改连线",object(edgeFields(),List.of("id"),2)),
      new Spec("remove_edge","移除连线",object(properties("id",ID),List.of("id"),1)),
      new Spec("set_style","设置风格（覆盖项合并，null清空）",object(properties("preset",enumeration(PRESETS),"palette",enumeration(Set.of("okabe-ito","npg","aaas","nejm","lancet","jama")),"overrides",overrideSchema(),"role_colors",nullable(object(properties("actor",COLOR,"process",COLOR,"data",COLOR,"model",COLOR,"output",COLOR,"note",COLOR),List.of("actor","process","data","model","output","note"),6))),List.of(),1)),
      new Spec("set_canvas","设置成品画布",object(properties("width_mm",number(10,2000),"height_mm",number(10,2000),"background",COLOR),List.of(),1)),
      new Spec("set_legend","设置图例",object(properties("mode",enumeration("auto","off"),"position",enumeration("bottom-right","bottom-left","top-right","top-left")),List.of(),1)),
      new Spec("update_artwork","移动、缩放、锁定或隐藏外部图层",object(properties("id",ID,"name",string(120),"x",number(0,2000),"y",number(0,2000),"w",number(.1,2000),"h",number(.1,2000),"locked",bool(),"hidden",bool()),List.of("id"),2)),
      new Spec("remove_artwork","移除外部图层（保留版本历史）",object(properties("id",ID),List.of("id"),1)),
      new Spec("set_attribution","设置图标导出署名",object(properties("enabled",bool()),List.of("enabled"),1)),
      new Spec("add_annotation","添加注释",object(properties("id",ID,"kind",enumeration("panel_letter","callout","note"),"target",ID,"text",string(200)),List.of("id","kind","target","text"),4)));
  public static ObjectNode catalog(){var out=JSON.createObjectNode().put("protocol_version",1).put("schema_version",1).put("execution","preview-only");var tools=out.putArray("tools");for(var s:SPECS){var t=tools.addObject().put("name",s.name()).put("label",s.label());t.set("input_schema",s.schema().deepCopy());}return out;}
  private static void check(JsonNode value,JsonNode schema){
    var types=schema.path("type");boolean valid=false;for(var type:types.isArray()?types:JSON.createArrayNode().add(types))valid|=switch(type.asText()){case "null"->value.isNull();case "object"->value.isObject();case "array"->value.isArray();case "number"->value.isNumber()&&Double.isFinite(value.asDouble());case "string"->value.isTextual();case "boolean"->value.isBoolean();default->false;};require(valid,"操作参数类型无效");if(value.isNull())return;
    if(schema.has("enum")){boolean found=false;for(var option:schema.path("enum"))found|=option.equals(value);require(found,"操作枚举值无效");}
    if(value.isNumber()){if(schema.has("minimum"))require(value.asDouble()>=schema.path("minimum").asDouble(),"操作数值过小");if(schema.has("maximum"))require(value.asDouble()<=schema.path("maximum").asDouble(),"操作数值过大");}
    if(value.isTextual()){if(schema.has("maxLength"))require(value.asText().codePointCount(0,value.asText().length())<=schema.path("maxLength").asInt(),"操作文字过长");if(schema.has("pattern"))require(value.asText().matches(schema.path("pattern").asText()),"操作文字格式无效");}
    if(value.isObject()){require(value.size()>=schema.path("minProperties").asInt(),"至少指定一项调整");for(var key:schema.path("required"))require(value.has(key.asText()),"缺少操作参数 "+key.asText());value.fields().forEachRemaining(e->{require(schema.path("properties").has(e.getKey()),"未知操作参数 "+e.getKey());check(e.getValue(),schema.path("properties").get(e.getKey()));});}
    if(value.isArray()){require(value.size()>=schema.path("minItems").asInt()&&value.size()<=schema.path("maxItems").asInt(Integer.MAX_VALUE),"操作数组数量无效");for(var item:value)check(item,schema.path("items"));}
  }
  private static ObjectNode copy(JsonNode n){return (ObjectNode)n.deepCopy();}
  private static void patch(ObjectNode target,JsonNode args){args.fields().forEachRemaining(e->{if(!e.getKey().equals("id"))target.set(e.getKey(),e.getValue().deepCopy());});}
  private static void remove(ArrayNode array,String id){for(int i=array.size()-1;i>=0;i--)if(array.get(i).path("id").asText().equals(id))array.remove(i);}
  public static ObjectNode apply(JsonNode before,JsonNode operations){
    validate(before);require(operations!=null&&operations.isArray()&&operations.size()<=400,"操作最多400项");require(operations.toString().getBytes(StandardCharsets.UTF_8).length<=MAX_BYTES,"操作超过2MB");var doc=copy(before);
    for(var operation:operations){fields(operation,"tool arguments","tool arguments");String name=text(operation.get("tool"),64);var spec=SPECS.stream().filter(s->s.name().equals(name)).findFirst().orElseThrow(()->dev.labflow.api.ApiException.bad("机制图：不支持的操作"));var args=operation.get("arguments");check(args,spec.schema());String id=args.path("id").asText();
      switch(name){
        case "add_zone"->{var z=copy(args);if(!z.has("zoom_of"))z.putNull("zoom_of");((ArrayNode)doc.path("zones")).add(z);}
        case "update_zone"->{var z=(ObjectNode)find(doc.path("zones"),id);double x=z.path("x").asDouble(),y=z.path("y").asDouble();patch(z,args);double dx=z.path("x").asDouble()-x,dy=z.path("y").asDouble()-y;for(var n:doc.path("nodes"))if(n.path("zone").asText().equals(id)){((ObjectNode)n).put("x",n.path("x").asDouble()+dx).put("y",n.path("y").asDouble()+dy);}}
        case "add_node"->{var n=copy(args);for(String key:List.of("zone","icon","style_ref"))if(!n.has(key))n.putNull(key);((ArrayNode)doc.path("nodes")).add(n);}
        case "update_node"->patch((ObjectNode)find(doc.path("nodes"),id),args);
        case "remove_node"->{for(var z:doc.path("zones"))if(z.path("zoom_of").asText().equals(id))((ObjectNode)z).putNull("zoom_of");find(doc.path("nodes"),id);remove((ArrayNode)doc.path("nodes"),id);var edges=(ArrayNode)doc.path("edges");for(int i=edges.size()-1;i>=0;i--)if(edges.get(i).path("from").asText().equals(id)||edges.get(i).path("to").asText().equals(id))edges.remove(i);var notes=(ArrayNode)doc.path("annotations");for(int i=notes.size()-1;i>=0;i--)if(notes.get(i).path("target").asText().equals(id))notes.remove(i);}
        case "add_edge"->{var e=copy(args);if(!e.has("label"))e.put("label","");if(!e.has("route"))e.put("route","straight");((ArrayNode)doc.path("edges")).add(e);}
        case "update_edge"->patch((ObjectNode)find(doc.path("edges"),id),args);
        case "remove_edge"->{find(doc.path("edges"),id);remove((ArrayNode)doc.path("edges"),id);}
        case "set_style"->{var style=(ObjectNode)doc.path("style");if(args.has("palette")){style.set("palette",args.get("palette").deepCopy());style.remove("role_colors");}if(args.has("role_colors")){if(args.get("role_colors").isNull())style.remove("role_colors");else style.set("role_colors",args.get("role_colors").deepCopy());}if(args.has("preset"))style.set("preset",args.get("preset").deepCopy());if(args.has("overrides")){if(args.get("overrides").isNull())style.putObject("overrides");else ((ObjectNode)style.path("overrides")).setAll(copy(args.get("overrides")));}}
        case "set_canvas"->patch((ObjectNode)doc.path("canvas"),args);
        case "set_legend"->patch((ObjectNode)doc.path("legend"),args);
        case "update_artwork"->{var layer=(ObjectNode)find(doc.path("artworks"),id);if(layer.path("locked").asBoolean()&&(!args.has("locked")||args.path("locked").asBoolean()))for(String key:List.of("x","y","w","h"))require(!args.has(key),"请先解锁外部图层");patch(layer,args);}
        case "remove_artwork"->{var layer=find(doc.path("artworks"),id);require(!layer.path("locked").asBoolean(),"请先解锁外部图层");remove((ArrayNode)doc.path("artworks"),id);}
        case "set_attribution"->((ObjectNode)doc.path("meta")).put("include_icon_attribution",args.path("enabled").asBoolean());
        case "add_annotation"->((ArrayNode)doc.path("annotations")).add(copy(args));
        default->throw new IllegalStateException("目录与实现不一致");
      }
    }
    validate(doc);return doc;
  }
  public static List<Map<String,Object>> changes(JsonNode before,JsonNode after){var out=new ArrayList<Map<String,Object>>();diff(before,after,"",out);return List.copyOf(out);}
  private static void diff(JsonNode before,JsonNode after,String path,List<Map<String,Object>> out){
    if(Objects.equals(before,after)||before!=null&&after!=null&&before.isNumber()&&after.isNumber()&&before.decimalValue().compareTo(after.decimalValue())==0)return;
    if(before!=null&&after!=null&&before.isObject()&&after.isObject()){var keys=new TreeSet<String>();before.fieldNames().forEachRemaining(keys::add);after.fieldNames().forEachRemaining(keys::add);for(String key:keys)diff(before.get(key),after.get(key),path+"/"+key.replace("~","~0").replace("/","~1"),out);return;}
    if(before!=null&&after!=null&&before.isArray()&&after.isArray()){for(int i=0;i<Math.max(before.size(),after.size());i++)diff(before.get(i),after.get(i),path+"/"+i,out);return;}
    out.add(Map.of("path",path,"before",before==null?NullNode.instance:before.deepCopy(),"after",after==null?NullNode.instance:after.deepCopy()));
  }
}
