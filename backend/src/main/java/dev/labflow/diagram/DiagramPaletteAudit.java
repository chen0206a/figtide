package dev.labflow.diagram;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.review.ColorVision;
import java.util.*;

/** Same outline mapping as the SVG renderer. Pale fills never participate. */
public final class DiagramPaletteAudit {
  public static final double WARNING_DELTA_E=10,INFO_DELTA_E=20;
  public static final List<String> ROLES=List.of("actor","process","data","model","output","note");
  private static final Map<String,String> KEYS=Map.of("actor","a","process","b","output","b","note","c","model","d","data","n");
  public static String severity(double min){return min<WARNING_DELTA_E?"warning":min<INFO_DELTA_E?"info":"passed";}
  private DiagramPaletteAudit() {}
  public static String outline(JsonNode palette,String preset,String role) {
    if(preset.equals("line-minimal"))return role.equals("note")?"#D55E00":"#0E1116";
    String key=KEYS.get(role),hex=palette.path(key).asText();double ratio=key.equals("n")?.95:.92;
    return String.format("#%02X%02X%02X",Math.round(Integer.parseInt(hex.substring(1,3),16)*ratio),Math.round(Integer.parseInt(hex.substring(3,5),16)*ratio),Math.round(Integer.parseInt(hex.substring(5,7),16)*ratio));
  }
  public static Set<String> usedRoles(JsonNode doc) {
    var roles=new LinkedHashSet<String>();
    for(var n:doc.path("nodes"))if(!n.path("kind").asText().equals("text")&&!(n.path("kind").asText().equals("glyph")&&Set.of("phospho","number","frozen","trainable").contains(n.path("glyph").asText())))roles.add(n.path("style_ref").isTextual()?n.path("style_ref").asText():n.path("role").asText());
    return roles;
  }
  public static Map<String,Object> audit(JsonNode palette,String preset,Set<String> used) {
    var outlines=new LinkedHashMap<String,String>();
    for(String role:ROLES)if(used.contains(role))outlines.put(role,outline(palette,preset,role));
    return auditOutlines(palette.path("id").asText(),preset,outlines);
  }
  public static Map<String,Object> auditOutlines(String id,String preset,Map<String,String> outlines){
    var pairs=new ArrayList<Map<String,Object>>();
    var roles=new ArrayList<>(outlines.keySet());
    for(int i=0;i<roles.size();i++)for(int j=0;j<i;j++){
      String a=roles.get(j),b=roles.get(i);double min=ColorVision.minimum(outlines.get(a),outlines.get(b));
      if(min<INFO_DELTA_E){var values=new ArrayList<Double>();for(int d=0;d<3;d++)values.add(ColorVision.deltaE(ColorVision.lab(outlines.get(a),d),ColorVision.lab(outlines.get(b),d)));
        pairs.add(Map.of("roles",List.of(a,b),"colors",List.of(outlines.get(a),outlines.get(b)),"minimum_delta_e",min,"delta_e",values,"severity",severity(min)));}
    }
    return Map.of("id",id,"preset",preset,"safe",pairs.stream().noneMatch(p->((Number)p.get("minimum_delta_e")).doubleValue()<WARNING_DELTA_E),"outlines",outlines,"failing_pairs",pairs,"threshold",WARNING_DELTA_E,"info_threshold",INFO_DELTA_E);
  }
}
