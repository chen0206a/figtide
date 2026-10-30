package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import java.util.*;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import static org.junit.jupiter.api.Assertions.*;

class DiagramValidatorTest {
  static final ObjectMapper JSON=new ObjectMapper();
  public static ObjectNode doc() { try{return (ObjectNode)JSON.readTree(DiagramValidatorTest.class.getResourceAsStream("/diagram-doc-v1.json"));}catch(Exception e){throw new RuntimeException(e);} }
  @Test void acceptsSyntheticDocumentAndAllAvailableKindsAndPresets() {
    var d=doc();DiagramValidator.validate(d);
    for(String s:DiagramValidator.PRESETS){((ObjectNode)d.path("style")).put("preset",s);DiagramValidator.validate(d);}
    for(String k:DiagramValidator.NODE_KINDS)if(!Set.of("icon","glyph").contains(k)){((ObjectNode)d.path("nodes").get(0)).put("kind",k);DiagramValidator.validate(d);}
    var node=(ObjectNode)d.path("nodes").get(0);node.put("kind","glyph").put("label_pos","below").put("boxed",false);node.putArray("badges").add("phospho");for(String glyph:DiagramValidator.GLYPHS){node.put("glyph",glyph);DiagramValidator.validate(d);}
    for(String k:DiagramValidator.EDGE_KINDS){((ObjectNode)d.path("edges").get(0)).put("kind",k);DiagramValidator.validate(d);}
  }
  static Stream<Consumer<ObjectNode>> invalid() { return Stream.of(
    d->d.put("unknown",true),d->d.put("schema_version",2),d->d.put("schema_version",1.0),
    d->((ObjectNode)d.path("canvas")).put("width_mm",Double.NaN),d->((ObjectNode)d.path("canvas")).put("extra",1),
    d->((ObjectNode)d.path("style")).put("preset","unknown"),d->((ObjectNode)d.at("/style/overrides")).put("url","https://example.com"),
    d->((ObjectNode)d.path("legend")).put("mode","unknown"),d->d.put("label_language","fr"),
    d->((ObjectNode)d.at("/nodes/0")).put("id","z1"),d->((ObjectNode)d.at("/nodes/0")).put("label","x".repeat(201)),
    d->((ObjectNode)d.at("/nodes/0")).put("x",175),d->((ObjectNode)d.at("/nodes/0")).put("x",-1),d->((ObjectNode)d.at("/nodes/0")).put("w",0),
    d->((ObjectNode)d.at("/nodes/0")).put("zone","missing"),d->((ObjectNode)d.at("/nodes/0")).put("x",1),
    d->((ObjectNode)d.at("/nodes/0")).put("icon","missing"),d->((ObjectNode)d.at("/nodes/0")).put("kind","icon"),
    d->((ObjectNode)d.at("/nodes/0")).put("kind","artwork"),d->((ObjectNode)d.at("/nodes/0")).put("role","invented"),
    d->((ObjectNode)d.at("/nodes/0")).put("kind","glyph"),d->((ObjectNode)d.at("/nodes/0")).put("glyph","protein"),
    d->((ObjectNode)d.at("/nodes/0")).put("label_pos","offcanvas"),d->((ObjectNode)d.at("/nodes/0")).put("boxed","true"),
    d->((ObjectNode)d.at("/nodes/0")).putArray("badges").add("invented"),d->((ObjectNode)d.at("/nodes/0")).putArray("badges").add("phospho").add("phospho"),
    d->((ObjectNode)d.at("/edges/0")).put("from","missing"),d->((ObjectNode)d.at("/edges/0")).put("route","unknown"),
    d->((ObjectNode)d.at("/zones/0")).put("zoom_of","missing"),d->((ObjectNode)d.at("/zones/0")).put("zoom_of","z1"),
    d->((ArrayNode)d.path("annotations")).addObject().put("id","a1").put("kind","note").put("target","missing").put("text","note"),
    d->((ObjectNode)d.path("meta")).put("image","data:image/png;base64,AAAA"),
    d->{var a=(ArrayNode)d.path("nodes");for(int i=0;i<120;i++)a.add(d.at("/nodes/0").deepCopy());},
    d->{var a=(ArrayNode)d.path("zones");for(int i=0;i<30;i++)a.add(d.at("/zones/0").deepCopy());},
    d->{var a=(ArrayNode)d.path("edges");for(int i=0;i<200;i++)a.add(d.at("/edges/0").deepCopy());},
    d->{var a=(ArrayNode)d.at("/meta/facts");for(int i=0;i<200;i++)a.add("中".repeat(10000));((ObjectNode)d.at("/meta")).put("brief","中".repeat(10000));}
  ); }
  @ParameterizedTest @MethodSource("invalid") void rejectsMalformedOrUnsupportedDocuments(Consumer<ObjectNode> mutation) {var d=doc();mutation.accept(d);assertThrows(ApiException.class,()->DiagramValidator.validate(d));}
  @Test void doesNotMutateTheInput() {var d=doc();var before=d.deepCopy();DiagramValidator.validate(d);assertEquals(before,d);}
}
