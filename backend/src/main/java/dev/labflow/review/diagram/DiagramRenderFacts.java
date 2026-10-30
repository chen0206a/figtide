package dev.labflow.review.diagram;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.review.RenderFacts;
import java.util.*;
import static dev.labflow.diagram.DiagramValidator.*;

/** Geometry only. All string values are fixed enums or hex colours, never document text or IDs. */
public final class DiagramRenderFacts {
  private DiagramRenderFacts(){}
  private static Set<String> keys(String s){return Set.of(s.split(" "));}
  private static void fields(JsonNode n,String names){RenderFacts.fields(n,keys(names),keys(names));}
  public static double number(JsonNode n){return dev.labflow.diagram.DiagramValidator.number(n,-100000,100000);}
  public static void box(JsonNode n){fields(n,"x y w h");number(n.get("x"));number(n.get("y"));dev.labflow.diagram.DiagramValidator.number(n.get("w"),0,100000);dev.labflow.diagram.DiagramValidator.number(n.get("h"),0,100000);}
  private static int index(JsonNode n,int max){require(n!=null&&n.isIntegralNumber()&&n.canConvertToInt()&&n.asInt()>=0&&n.asInt()<max,"渲染索引无效");return n.asInt();}
  private static void array(JsonNode n,int max){require(n!=null&&n.isArray()&&n.size()<=max,"渲染事实数量无效");}
  public static Map<String,Integer> expectedTexts(JsonNode doc){
    Map<String,Integer> expected=new HashMap<>();
    for(String kind:List.of("node","zone","annotation")){String field=kind.equals("node")?"nodes":kind.equals("zone")?"zones":"annotations";for(int i=0;i<doc.path(field).size();i++){int count=1;if(kind.equals("node"))for(var badge:doc.path(field).get(i).path("badges"))if(badge.asText().startsWith("number:"))count++;expected.put(kind+":"+i,count);}}
    Set<String> kinds=new HashSet<>();for(int i=0;i<doc.path("edges").size();i++){var edge=doc.path("edges").get(i);kinds.add(edge.path("kind").asText());if(!edge.path("label").asText().isEmpty())expected.put("edge:"+i,1);}
    if(kinds.size()>=2&&doc.at("/legend/mode").asText().equals("auto"))for(int i=0;i<kinds.size();i++)expected.put("legend:"+i,1);
    return expected;
  }
  public static JsonNode validate(JsonNode facts,JsonNode doc){
    if(facts==null||facts.isNull()||facts.isMissingNode())return null;
    fields(facts,"kind version canvas nodes texts edges");require(facts.path("kind").asText().equals("diagram")&&facts.path("version").isIntegralNumber()&&facts.path("version").canConvertToInt()&&facts.path("version").asInt()==1,"渲染事实版本无效");
    require(facts.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length<=2*1024*1024,"渲染事实过大");
    fields(facts.path("canvas"),"width height");for(String axis:List.of("width","height")){double value=number(facts.path("canvas").get(axis));require(Math.abs(value-doc.path("canvas").path(axis+"_mm").asDouble())<.0001,"渲染尺寸与文档不一致");}
    array(facts.get("nodes"),120);array(facts.get("texts"),1500);array(facts.get("edges"),200);
    require(facts.path("nodes").size()==doc.path("nodes").size()&&facts.path("edges").size()==doc.path("edges").size(),"渲染事实不完整");
    Set<Integer> nodes=new HashSet<>(),edges=new HashSet<>();
    for(var n:facts.path("nodes")){fields(n,"index box");require(nodes.add(index(n.get("index"),doc.path("nodes").size())),"渲染节点重复");box(n.get("box"));}
    Map<String,Integer> expected=expectedTexts(doc),actual=new HashMap<>();
    for(var t:facts.path("texts")){fields(t,"owner_kind owner_index box container font_pt color");String kind=choice(t.get("owner_kind"),Set.of("node","zone","edge","annotation","legend"));int count=switch(kind){case "node"->doc.path("nodes").size();case "zone"->doc.path("zones").size();case "edge"->doc.path("edges").size();case "annotation"->doc.path("annotations").size();default->6;};int i=index(t.get("owner_index"),count);actual.merge(kind+":"+i,1,Integer::sum);box(t.get("box"));box(t.get("container"));dev.labflow.diagram.DiagramValidator.number(t.get("font_pt"),.01,1000);color(t.get("color"));}
    require(expected.equals(actual),"文字几何缺失或重复");
    for(var e:facts.path("edges")){fields(e,"index points arrow");require(edges.add(index(e.get("index"),doc.path("edges").size())),"渲染连线重复");array(e.get("points"),100);require(e.path("points").size()>=2,"连线缺少折线点");for(var p:e.path("points")){array(p,2);require(p.size()==2,"折线点无效");number(p.get(0));number(p.get(1));}fields(e.path("arrow"),"x y");number(e.path("arrow").get("x"));number(e.path("arrow").get("y"));}
    return facts.deepCopy();
  }
}
