package dev.labflow.review;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.api.ApiException;
import java.util.*;

/** Reject rather than strip unknown keys, preventing geometry envelopes becoming a data channel. */
public final class RenderFacts {
  private RenderFacts() {}
  public static void fields(JsonNode n,Set<String> allowed,Set<String> required){
    if(n==null||!n.isObject())bad();
    n.fieldNames().forEachRemaining(k->{if(!allowed.contains(k))bad();});
    for(String k:required)if(!n.has(k))bad();
  }
  private static void bad(){throw ApiException.bad("渲染信息格式或数量无效；只允许有限的几何信息");}
  private static void number(JsonNode n,double min,double max){if(n==null||!n.isNumber()||!Double.isFinite(n.asDouble())||n.asDouble()<min||n.asDouble()>max)bad();}
  private static void array(JsonNode n,int max){if(n==null||!n.isArray()||n.size()>max)bad();}
  private static void trace(JsonNode n){if(!n.isIntegralNumber()||!n.canConvertToInt()||n.asInt()<0||n.asInt()>10000)bad();}
  private static void box(JsonNode n){
    fields(n,Set.of("x","y","width","height"),Set.of("x","y","width","height"));
    number(n.path("x"),-100000,100000);number(n.path("y"),-100000,100000);
    number(n.path("width"),0,100000);number(n.path("height"),0,100000);
  }
  public static void target(JsonNode target){
    if(target==null||target.isNull()||target.isMissingNode())return;
    fields(target,Set.of("width_mm","journal"),Set.of());
    if(target.has("width_mm"))number(target.path("width_mm"),40,300);
    if(target.has("journal")&&(!target.path("journal").isTextual()||target.path("journal").asText().length()>64))bad();
  }
  public static JsonNode validate(JsonNode n){
    if(n==null||n.isNull()||n.isMissingNode())return null;
    fields(n,Set.of("version","canvas","plot","legend","texts","points","bands"),Set.of("version","canvas","plot","texts","points","bands"));
    if(!n.path("version").isIntegralNumber()||!n.path("version").canConvertToInt()||n.path("version").asInt()!=1)bad();
    fields(n.path("canvas"),Set.of("width","height"),Set.of("width","height"));
    number(n.path("canvas").path("width"),1,10000);number(n.path("canvas").path("height"),1,10000);
    box(n.path("plot"));if(n.has("legend"))box(n.path("legend"));
    array(n.path("texts"),300);array(n.path("points"),3000);array(n.path("bands"),20);
    for(var text:n.path("texts")){
      fields(text,Set.of("role","box","fontPx"),Set.of("role","box","fontPx"));
      if(!text.path("role").isTextual()||!Set.of("title","xTitle","yTitle","tick","legend","annotation").contains(text.path("role").asText()))bad();
      box(text.path("box"));number(text.path("fontPx"),.01,1000);
    }
    Map<Integer,Integer> counts=new HashMap<>();
    for(var point:n.path("points")){
      fields(point,Set.of("trace","x","y"),Set.of("trace","x","y"));trace(point.path("trace"));
      if(counts.merge(point.path("trace").asInt(),1,Integer::sum)>200)bad();
      number(point.path("x"),-100000,100000);number(point.path("y"),-100000,100000);
    }
    for(var band:n.path("bands")){
      fields(band,Set.of("trace","polygon"),Set.of("trace","polygon"));trace(band.path("trace"));array(band.path("polygon"),100);
      if(band.path("polygon").size()<3)bad();
      for(var xy:band.path("polygon")){array(xy,2);if(xy.size()!=2)bad();for(var v:xy)number(v,-100000,100000);}
    }
    return n.deepCopy();
  }
}
