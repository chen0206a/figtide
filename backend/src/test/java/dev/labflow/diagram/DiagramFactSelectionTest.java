package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.review.*;
import dev.labflow.review.diagram.DiagramReviewService;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class DiagramFactSelectionTest {
  final ObjectMapper json=new ObjectMapper();final DiagramCatalog catalog=new DiagramCatalog(json,new JournalRules(json));
  final DiagramAgentEngine engine=new DiagramAgentEngine(json,catalog,mock(DiagramService.class),new DiagramReviewService(json,catalog,new JournalRules(json)));
  ObjectNode request()throws Exception{return (ObjectNode)json.readTree("""
    {"skill_id":"workflow","brief":"RNA workflow","source_prompt":"RNA enters Library. Control inhibits Library.","facts":[{"text":"RNA enters Library.","quote":"RNA enters Library."},{"text":"Control inhibits Library.","quote":"Control inhibits Library."}]}
    """);}
  ObjectNode before(){var d=(ObjectNode)catalog.template("workflow","en");((ArrayNode)d.path("nodes")).removeAll();((ArrayNode)d.path("edges")).removeAll();((ArrayNode)d.path("zones")).removeAll();var node=((ArrayNode)d.path("nodes")).addObject();node.put("id","original").put("kind","box").put("label","Original").put("role","data").put("x",10).put("y",10).put("w",28).put("h",14).putNull("zone").putNull("icon").putNull("style_ref");return d;}
  JsonNode ops()throws Exception{return json.readTree("""
    [{"tool":"update_node","arguments":{"id":"original","label":"RNA","fact_indices":[0]}},
    {"tool":"add_node","arguments":{"id":"library","label":"Library","kind":"box","role":"process","fact_indices":[0,1]}},
    {"tool":"add_node","arguments":{"id":"control","label":"Control","kind":"box","role":"note","fact_indices":[1]}},
    {"tool":"add_edge","arguments":{"id":"flow","from":"original","to":"library","kind":"flow","fact_indices":[0]}},
    {"tool":"add_edge","arguments":{"id":"inhibition","from":"control","to":"library","kind":"inhibit","fact_indices":[1]}}]
    """);}
  @Test void uncheckedFactsDropOwnedNewElementsRestoreOldEditsAndKeepSharedEntities()throws Exception{
    var before=before();var candidate=engine.candidate(before,ops(),request());var zero=DiagramFactSelection.select(candidate,json.createArrayNode().add(0));assertEquals(List.of("original","library"),zero.path("nodes").findValuesAsText("id"));assertEquals("RNA",zero.at("/nodes/0/label").asText());assertEquals(List.of("flow"),zero.path("edges").findValuesAsText("id"));assertEquals(1,zero.at("/meta/facts").size());
    var one=DiagramFactSelection.select(candidate,json.createArrayNode().add(1));assertEquals("Original",one.at("/nodes/0/label").asText());assertEquals(List.of("inhibition"),one.path("edges").findValuesAsText("id"));assertEquals(3,one.path("nodes").size());
    var none=DiagramFactSelection.select(candidate,json.createArrayNode());assertEquals(before.path("nodes"),none.path("nodes"));assertTrue(none.path("edges").isEmpty());assertEquals(3,candidate.at("/config/nodes").size());
    assertEquals(candidate.path("config"),DiagramFactSelection.select(candidate,json.createArrayNode().add(0).add(1)));
  }
  @Test void styleDefaultsAreEnforcedUnlessTheUserExplicitlyAllowsSmallerValues()throws Exception{
    var ops=(ArrayNode)ops();ops.addObject().put("tool","set_style").putObject("arguments").putObject("overrides").put("font_size_pt",3).put("line_width_pt",.2);
    var request=request();var safe=engine.candidate(before(),ops,request);assertEquals(7,safe.at("/config/style/overrides/font_size_pt").asDouble());assertEquals(1,safe.at("/config/style/overrides/line_width_pt").asDouble());request.put("allow_below_style_defaults",true);var explicit=engine.candidate(before(),ops,request);assertEquals(3,explicit.at("/config/style/overrides/font_size_pt").asDouble());assertEquals(.2,explicit.at("/config/style/overrides/line_width_pt").asDouble());
    assertThrows(RuntimeException.class,()->DiagramFactSelection.indices(json.createArrayNode().add(0).add(0),2,true));assertThrows(RuntimeException.class,()->DiagramFactSelection.indices(json.createArrayNode().add(2),2,true));
  }
  @Test void initialExclusionIsAlsoEnforcedBeforeAnyPreview()throws Exception{
    var request=request();request.putArray("selected_facts").add(0);var result=engine.candidate(before(),ops(),request);assertEquals(2,result.at("/config/nodes").size());assertEquals(List.of("flow"),result.at("/config/edges").findValuesAsText("id"));
  }
  JsonNode browserNumbers(JsonNode value){if(value.isFloatingPointNumber()&&value.asDouble()==Math.rint(value.asDouble()))return IntNode.valueOf(value.asInt());if(value.isObject()){var out=JSONNode(value);for(var name:new java.util.ArrayList<String>(){{value.fieldNames().forEachRemaining(this::add);}})out.set(name,browserNumbers(value.get(name)));return out;}if(value.isArray()){var out=json.createArrayNode();for(var n:value)out.add(browserNumbers(n));return out;}return value.deepCopy();}
  ObjectNode JSONNode(JsonNode value){return (ObjectNode)value.deepCopy();}
  @Test void browserIntegerSerializationIsAllowedButSemanticOrSizeChangesAreNot()throws Exception{
    var candidate=engine.candidate(before(),ops(),request()).path("doc");var browser=(ObjectNode)browserNumbers(candidate);((ObjectNode)browser.path("nodes").get(0)).put("x",12);var response=json.createObjectNode();response.set("doc",browser);assertEquals(browser,engine.rendered(candidate,response));((ObjectNode)browser.path("nodes").get(0)).put("w",29);assertThrows(RuntimeException.class,()->engine.rendered(candidate,response));
  }

}
