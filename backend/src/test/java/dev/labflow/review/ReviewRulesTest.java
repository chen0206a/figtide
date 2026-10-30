package dev.labflow.review;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.review.rules.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class ReviewRulesTest {
  final ObjectMapper json=new ObjectMapper();
  ObjectNode config() throws Exception {return (ObjectNode)json.readTree(getClass().getResourceAsStream("/config-v1.json"));}
  ReviewContext ctx(ObjectNode c,JsonNode facts,JsonNode meta,List<ReviewContext.OtherChart> others){return new ReviewContext(c,facts,new JournalRules(json).get("default"),88,meta==null?json.createObjectNode():meta,others);}
  ReviewContext ctx(ObjectNode c){return ctx(c,null,null,List.of());}
  ObjectNode facts() throws Exception {return (ObjectNode)json.readTree("""
      {"version":1,"canvas":{"width":760,"height":500},"plot":{"x":75,"y":70,"width":650,"height":360},
       "legend":{"x":100,"y":100,"width":120,"height":50},"texts":[],"points":[{"trace":0,"x":110,"y":110}],"bands":[]}
      """);}
  @Test void physicalConversionMatchesFrontendFixturesAndFontTrigger() throws Exception {
    for(var f:json.readTree(Files.readString(Path.of("../frontend/src/editor/review-metrics-v1.json")))){
      var c=config();((ObjectNode)c.path("style")).put("width",f.path("canvas").asInt());
      c.putObject("publication").put("enabled",true).put("widthMm",f.path("width").asDouble()).put("fontPt",f.path("font").asDouble()).put("dpi",300);
      var ctx=new ReviewContext(c,null,new JournalRules(json).get("default"),f.path("width").asDouble(),json.createObjectNode(),List.of());
      assertEquals(f.path("pixels").asDouble(),ctx.baseFontPx(),1e-9);assertEquals(f.path("font").asDouble(),ctx.points(f.path("pixels").asDouble()),1e-9);
    }
    var c=config();assertFalse(new R1FontSize().check(ctx(c)).isEmpty());
    ((ObjectNode)c.path("style")).put("fontSize",30);assertTrue(new R1FontSize().check(ctx(c)).isEmpty());
  }
  @Test void lineWidthAndColorCountHaveBothBranches() throws Exception {
    var c=config();assertTrue(new R2LineWidth().check(ctx(c)).isEmpty());
    ((ObjectNode)c.path("series").get(0)).put("width",.5);assertEquals(1,new R2LineWidth().check(ctx(c)).size());
    assertTrue(new R4ColorCount().check(ctx(c)).isEmpty());
    for(int i=1;i<9;i++)((ArrayNode)c.path("series")).add(c.path("series").get(0).deepCopy());
    assertEquals(1,new R4ColorCount().check(ctx(c)).size());
  }
  @Test void paletteDetectsSimilarityAndKeepsAllFixesInExistingTools() throws Exception {
    var c=config();assertTrue(new R3ColorVision().check(ctx(c)).isEmpty());
    var second=c.path("series").get(0).deepCopy();((ObjectNode)second).put("id","s2");((ArrayNode)c.path("series")).add(second);
    var issue=new R3ColorVision().check(ctx(c)).getFirst();assertTrue(issue.fixable());assertEquals(2,issue.fix().size());
    assertTrue(issue.fix().stream().allMatch(f->f.get("tool").equals("set_series")));
    ((ObjectNode)second).put("color","#FFFFFF");((ObjectNode)c.path("series").get(0)).put("color","#000000");
    assertTrue(new R3ColorVision().check(ctx(c)).isEmpty());
  }
  @Test void errorsNeverGuessAndDerivedMeaningIsExplicitAdvice() throws Exception {
    var c=config();var unknown=new R6ErrorMeaning().check(ctx(c)).getFirst();assertFalse(unknown.fixable());assertTrue(unknown.detail().contains("不会根据列名猜测"));
    ((ObjectNode)c.path("series").get(0)).put("error","");assertTrue(new R6ErrorMeaning().check(ctx(c)).isEmpty());
    ((ObjectNode)c.path("series").get(0)).put("error","error");
    var meta=json.readTree("{\"kind\":\"data_processing\",\"rules\":{\"error\":\"sem\"},\"review_error_method\":\"sem\",\"review_group_n\":[4]}");
    assertTrue(new R6ErrorMeaning().check(ctx(c,null,meta,List.of())).getFirst().detail().contains("SEM"));
    ((ObjectNode)c.path("style")).put("title","mean ± SEM, n=4");assertTrue(new R6ErrorMeaning().check(ctx(c,null,meta,List.of())).isEmpty());
    ((ObjectNode)c.path("style")).put("title","mean ± SEM, n=5");assertFalse(new R6ErrorMeaning().check(ctx(c,null,meta,List.of())).isEmpty());
  }
  @Test void legendChoosesOnlyAnEmptyCornerAndAllCornersBusyBecomeAdvice() throws Exception {
    var c=config();var f=facts();assertTrue(new R7LegendOverlap().check(ctx(c,f,null,List.of())).getFirst().fixable());
    ((ArrayNode)f.path("points")).removeAll();assertTrue(new R7LegendOverlap().check(ctx(c,f,null,List.of())).isEmpty());
    var points=(ArrayNode)f.path("points");for(int x:List.of(110,650))for(int y:List.of(110,400))points.addObject().put("trace",0).put("x",x).put("y",y);
    assertFalse(new R7LegendOverlap().check(ctx(c,f,null,List.of())).getFirst().fixable());
  }
  @Test void textOverlapAndBoundsAreGeometricOnly() throws Exception {
    var c=config();var f=facts();var texts=(ArrayNode)f.path("texts");
    assertTrue(new R8TextOverlap().check(ctx(c,f,null,List.of())).isEmpty());
    texts.add(json.readTree("{\"role\":\"title\",\"fontPx\":14,\"box\":{\"x\":-1,\"y\":0,\"width\":30,\"height\":20}}"));
    texts.add(json.readTree("{\"role\":\"tick\",\"fontPx\":14,\"box\":{\"x\":0,\"y\":5,\"width\":30,\"height\":20}}"));
    assertEquals(2,new R8TextOverlap().check(ctx(c,f,null,List.of())).size());
  }
  @Test void axesAndProjectColorsAreAdviceAndStable() throws Exception {
    var c=config();assertTrue(new R9AxisMarking().check(ctx(c)).isEmpty());
    assertTrue(new R5AxisTitles().check(ctx(c)).isEmpty());
    ((ObjectNode)c.path("axes").path("x")).put("title","");assertEquals("R5",new R5AxisTitles().check(ctx(c)).getFirst().rule());
    ((ObjectNode)c.path("axes").path("y")).put("log",true);assertEquals(1,new R9AxisMarking().check(ctx(c)).size());
    ((ObjectNode)c.path("axes").path("y")).put("title","log accuracy");assertTrue(new R9AxisMarking().check(ctx(c)).isEmpty());
    assertTrue(new R10ProjectColors().check(ctx(c)).isEmpty());var other=c.deepCopy();((ObjectNode)other.path("series").get(0)).put("color","#000000");
    var found=new R10ProjectColors().check(ctx(c,null,null,List.of(new ReviewContext.OtherChart("Other chart",other))));
    assertFalse(found.getFirst().fixable());assertTrue(found.getFirst().detail().contains("Other chart"));
  }
  @Test void serviceMarksMissingFactsSkippedAndIsRepeatable() throws Exception {
    var c=config();String before=c.toString();var service=new ReviewService(new JournalRules(json),json);
    var a=service.review(c,null,json.createObjectNode(),null,List.of());var b=service.review(c,null,json.createObjectNode(),null,List.of());
    assertEquals(a,b);assertEquals(2,a.path("skipped").size());assertEquals(before,c.toString());
    assertFalse(a.path("passed").toString().contains("R7"));
  }
}
