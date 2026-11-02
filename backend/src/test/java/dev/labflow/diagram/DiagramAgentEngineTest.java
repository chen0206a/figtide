package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.review.*;
import dev.labflow.review.diagram.DiagramReviewService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class DiagramAgentEngineTest {
  final ObjectMapper json=new ObjectMapper();final DiagramCatalog catalog=new DiagramCatalog(json,new JournalRules(json));
  final DiagramAgentEngine engine=new DiagramAgentEngine(json,catalog,mock(DiagramService.class),new DiagramReviewService(json,catalog,new JournalRules(json)));
  ObjectNode request()throws Exception{return (ObjectNode)json.readTree("""
    {"skill_id":"workflow","diagram_stage":"structure","brief":"RNA workflow","source_prompt":"RNA enters the library.","facts":[{"text":"RNA enters the library.","quote":"RNA enters the library."}],"facts_confirmed":true}
    """);}
  @Test void modelFactsNeedActualQuotesAndDirectExtraction()throws Exception{
    assertEquals(1,engine.parseBrief("{\"brief\":\"RNA\",\"facts\":[{\"text\":\"RNA\",\"quote\":\"RNA enters the library.\"}]}","RNA enters the library.").path("facts").size());
    assertThrows(RuntimeException.class,()->engine.parseBrief("{\"brief\":\"RNA\",\"facts\":[{\"text\":\"Invented\",\"quote\":\"RNA\"}]}","RNA"));
    assertThrows(RuntimeException.class,()->engine.parseBrief("{\"brief\":\"RNA\",\"facts\":[{\"text\":\"RNA\",\"quote\":\"Missing sentence\"}]}","RNA"));
  }
  @Test void semanticToolsCannotSupplyGeometryOrAccessOtherData()throws Exception{
    var tools=engine.definitions(request());for(var t:tools){String name=t.at("/function/name").asText();assertFalse(name.contains("dataset"));assertFalse(name.contains("chart"));if(name.endsWith("node")||name.endsWith("zone"))for(String k:new String[]{"x","y","w","h"})assertFalse(t.at("/function/parameters/properties").has(k));}
    var doc=catalog.template("workflow","en");var ops=json.readTree("[{\"tool\":\"add_node\",\"arguments\":{\"id\":\"newRNA\",\"kind\":\"box\",\"label\":\"RNA\",\"role\":\"data\",\"x\":1}}]");
    assertThrows(RuntimeException.class,()->engine.candidate(doc,ops,request()));
    var honest=(ArrayNode)ops.deepCopy();((ObjectNode)honest.get(0).path("arguments")).remove("x");var candidate=engine.candidate(doc,honest,request());assertEquals("RNA",candidate.at("/doc/nodes/4/label").asText());
    var changed=candidate.path("doc").deepCopy();((ObjectNode)changed.path("nodes").get(0)).put("label","Arbitrary");assertThrows(RuntimeException.class,()->engine.rendered(candidate.path("doc"),json.createObjectNode().set("doc",changed)));
  }
  @Test void d8ChecksWordBoundariesAndOnlyCurrentAiLabels()throws Exception{
    var doc=(ObjectNode)catalog.template("workflow","en");((ObjectNode)doc.path("nodes").get(0)).put("label","RNA");var meta=(ObjectNode)doc.path("meta");meta.put("source_text","RNA enters the library.");meta.putArray("ai_labels").addObject().put("id",doc.at("/nodes/0/id").asText()).put("label","RNA");
    var review=new DiagramReviewService(json,catalog,new JournalRules(json));assertTrue(review.review(doc,null,null).path("passed").toString().contains("D8"));
    meta.put("source_text","TRNA is different.");assertTrue(review.review(doc,null,null).path("issues").toString().contains("D8"));
    ((ObjectNode)doc.path("nodes").get(0)).put("label","Manually edited");assertFalse(review.review(doc,null,null).path("issues").toString().contains("D8"));
  }
}
