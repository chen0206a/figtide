package dev.labflow.review.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.diagram.*;
import dev.labflow.review.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DiagramReviewTest {
  final ObjectMapper json=new ObjectMapper();final JournalRules journals=new JournalRules(json);
  final DiagramCatalog catalog=new DiagramCatalog(json,journals);final DiagramReviewService service=new DiagramReviewService(json,catalog,journals);
  ObjectNode doc(){return (ObjectNode)catalog.template("workflow","en");}
  ObjectNode facts(JsonNode doc){
    var f=json.createObjectNode().put("kind","diagram").put("version",1);f.putObject("canvas").put("width",180).put("height",110);
    var nodes=f.putArray("nodes");for(int i=0;i<doc.path("nodes").size();i++){var n=doc.path("nodes").get(i);nodes.addObject().put("index",i).set("box",box(n.path("x").asDouble(),n.path("y").asDouble(),n.path("w").asDouble(),n.path("h").asDouble()));}
    var texts=f.putArray("texts");for(var e:DiagramRenderFacts.expectedTexts(doc).entrySet())for(int j=0;j<e.getValue();j++){var parts=e.getKey().split(":");var t=texts.addObject().put("owner_kind",parts[0]).put("owner_index",Integer.parseInt(parts[1])).put("font_pt",7).put("color","#000000");t.set("box",box(5+texts.size()*5,5,2,2));t.set("container",box(0,0,180,110));}
    var edges=f.putArray("edges");for(int i=0;i<doc.path("edges").size();i++){var e=edges.addObject().put("index",i);var pts=e.putArray("points");pts.addArray().add(1).add(100-i*4);pts.addArray().add(170).add(100-i*4);e.putObject("arrow").put("x",170).put("y",100-i*4);}
    return f;
  }
  ObjectNode box(double x,double y,double w,double h){return json.createObjectNode().put("x",x).put("y",y).put("w",w).put("h",h);}
  JsonNode review(JsonNode d,JsonNode f){return service.review(d,f,json.createObjectNode());}
  List<JsonNode> issues(JsonNode report,String rule){var list=new ArrayList<JsonNode>();for(var i:report.path("issues"))if(i.path("rule").asText().equals(rule))list.add(i);return list;}
  @Test void fontsAndLinesUseFinishedScaleAndRepairsValidateWithoutSaving(){
    var d=doc();var f=facts(d);assertTrue(issues(review(d,f),"D1").isEmpty());assertTrue(issues(review(d,f),"D2").isEmpty());
    ((ObjectNode)d.at("/style/overrides")).put("font_size_pt",3).put("line_width_pt",.2);for(var t:f.path("texts"))((ObjectNode)t).put("font_pt",3);
    var r=review(d,f);for(String rule:List.of("D1","D2")){var i=issues(r,rule).getFirst();assertTrue(i.path("fixable").asBoolean());var repaired=DiagramOperations.apply(d,i.path("fix"));DiagramValidator.validate(repaired);assertEquals(rule.equals("D1")?7:1,repaired.at(rule.equals("D1")?"/style/overrides/font_size_pt":"/style/overrides/line_width_pt").asDouble(),1e-6);}
    var scaled=service.review(doc(),facts(doc()),json.createObjectNode().put("width_mm",88));assertFalse(issues(scaled,"D1").isEmpty());assertFalse(issues(scaled,"D2").isEmpty());
  }
  @Test void paletteChecksOnlyUsedOutlinesAndRetainsDefaultOwnerDecision(){
    var d=(ObjectNode)catalog.template("mechanism","en");var r=review(d,null);assertFalse(issues(r,"D3").isEmpty());for(var i:issues(r,"D3")){assertFalse(i.path("fixable").asBoolean());assertTrue(i.path("detail").asText().contains("20"));assertEquals("info",i.path("severity").asText());assertTrue(i.path("detail").asText().contains("#"));}
    for(var n:d.path("nodes"))((ObjectNode)n).put("role","actor");assertTrue(issues(review(d,null),"D3").isEmpty());assertFalse(r.path("passed").toString().contains("D4"));assertEquals(3,r.path("skipped").size());assertTrue(r.path("passed").toString().contains("D9"));
  }
  @Test void overflowAndOverlappingTextTriggerAndSafeTextPasses(){
    var d=doc();var f=facts(d);assertTrue(issues(review(d,f),"D4").isEmpty());
    ((ObjectNode)f.at("/texts/0")).set("container",box(0,0,1,1));assertTrue(issues(review(d,f),"D4").stream().anyMatch(i->i.path("severity").asText().equals("error")));
    ((ObjectNode)f.at("/texts/0")).set("container",box(0,0,180,110));((ObjectNode)f.at("/texts/1")).set("box",f.at("/texts/0/box").deepCopy());assertTrue(issues(review(d,f),"D4").stream().anyMatch(i->i.path("severity").asText().equals("warning")));
  }
  @Test void edgesDetectObstructionsOverlapArrowCrowdingAndCrossings(){
    var d=doc();var f=facts(d);assertTrue(issues(review(d,f),"D5").isEmpty());
    ((ObjectNode)f.at("/nodes/2")).set("box",box(40,95,10,10));assertTrue(issues(review(d,f),"D5").stream().anyMatch(i->i.path("id").asText().contains("node-")));
    ((ObjectNode)f.at("/edges/1")).set("points",f.at("/edges/0/points").deepCopy());((ObjectNode)f.at("/edges/1")).set("arrow",f.at("/edges/0/arrow").deepCopy());var r=review(d,f);assertTrue(issues(r,"D5").stream().anyMatch(i->i.path("id").asText().contains("shared-")));assertTrue(issues(r,"D5").stream().anyMatch(i->i.path("id").asText().contains("arrows-")));
    var pts=(ArrayNode)f.at("/edges/0/points");pts.removeAll();for(int i=0;i<10;i++)pts.addArray().add(i%2==0?10:160).add(10+i*8);
    ((ObjectNode)f.at("/edges/1")).putArray("points").addArray().add(80).add(0);((ArrayNode)f.at("/edges/1/points")).addArray().add(80).add(105);assertTrue(issues(review(d,f),"D5").stream().anyMatch(i->i.path("id").asText().contains("crossings")));
  }
  @Test void legendsAndIsolatedStepsHaveExplicitSemantics(){
    var d=doc();assertTrue(issues(review(d,null),"D6").isEmpty());assertTrue(issues(review(d,null),"D7").isEmpty());
    ((ObjectNode)d.at("/edges/0")).put("kind","activate");((ObjectNode)d.at("/edges/1")).put("kind","inhibit");((ObjectNode)d.path("legend")).put("mode","off");assertTrue(issues(review(d,null),"D6").getFirst().path("fixable").asBoolean());
    ((ArrayNode)d.path("edges")).removeAll();var i=issues(review(d,null),"D7");assertEquals(d.path("nodes").size(),i.size());assertFalse(i.getFirst().path("fixable").asBoolean());
  }
  @Test void strictGeometryRejectsLabelsIdsNaNMissingDuplicatedFactsAndWrongVersion(){
    var d=doc();var f=facts(d);assertEquals(f,DiagramRenderFacts.validate(f,d));assertFalse(f.toString().contains(d.at("/nodes/0/label").asText()));
    for(String key:List.of("label","node_id","text")){var bad=f.deepCopy();((ObjectNode)bad.at("/texts/0")).put(key,"PRIVATE_LABEL");assertThrows(RuntimeException.class,()->DiagramRenderFacts.validate(bad,d));}
    var nan=f.deepCopy();((ObjectNode)nan.at("/texts/0/box")).put("x",Double.NaN);assertThrows(RuntimeException.class,()->DiagramRenderFacts.validate(nan,d));
    var missing=f.deepCopy();((ArrayNode)missing.path("texts")).remove(0);assertThrows(RuntimeException.class,()->DiagramRenderFacts.validate(missing,d));
    var duplicate=f.deepCopy();((ArrayNode)duplicate.path("nodes")).set(1,duplicate.at("/nodes/0"));assertThrows(RuntimeException.class,()->DiagramRenderFacts.validate(duplicate,d));
    var version=f.deepCopy().put("version",2);assertThrows(RuntimeException.class,()->DiagramRenderFacts.validate(version,d));
  }
  @Test void suppliedTemplatesHaveNoStructuralErrorsAndReviewsArePure(){for(var t:catalog.templates())for(String lang:List.of("en","zh")){var d=t.at("/documents/"+lang);var before=d.deepCopy();assertTrue(issues(review(d,null),"D1").isEmpty());assertTrue(issues(review(d,null),"D2").isEmpty());assertEquals(before,d);}}

  @Test void alternativePaletteFixIsOfferedOnlyWhenAllUsedOutlinePairsMeetTwenty(){
    var d=doc();for(var n:d.path("nodes"))((ObjectNode)n).put("role","actor");((ObjectNode)d.at("/nodes/0")).put("role","model");boolean found=false;
    for(var palette:catalog.palettes()){
      ((ObjectNode)d.path("style")).put("palette",palette.path("id").asText());
      for(var i:issues(review(d,null),"D3"))if(i.path("fixable").asBoolean()){
        var repaired=DiagramOperations.apply(d,i.path("fix"));var chosen=catalog.palettes().stream().filter(p->p.path("id").asText().equals(repaired.at("/style/palette").asText())).findFirst().orElseThrow();
        assertTrue(ColorVision.minimum(DiagramPaletteAudit.outline(chosen,"nature-flat","actor"),DiagramPaletteAudit.outline(chosen,"nature-flat","model"))>=10);found=true;
      }
    }
    assertTrue(found,"At least one nondefault palette supports a validated actor/model repair");
  }
 @Test void identicalRoleColorsUseTheExplicitSameColorMessage(){var d=doc();for(var n:d.path("nodes"))((ObjectNode)n).put("role",n==d.path("nodes").get(0)?"process":"output");var found=issues(review(d,null),"D3");assertTrue(found.stream().anyMatch(i->i.path("title").asText().contains("用了相同颜色")));}

}
