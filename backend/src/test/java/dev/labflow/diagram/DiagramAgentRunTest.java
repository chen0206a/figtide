package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.*;
import dev.labflow.agent.*;
import dev.labflow.service.WorkspaceService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties="labflow.test-support=false") @ContextConfiguration(initializers=TestDatasourceInitializer.class)
class DiagramAgentRunTest {
  @Autowired ObjectMapper json;@Autowired AgentRunService agent;@Autowired DiagramService diagrams;@Autowired DiagramCatalog catalog;@Autowired WorkspaceService workspace;
  @MockitoBean ModelProvider provider;
  ObjectNode request;long project,diagram;
  @BeforeEach void setup()throws Exception{
    when(provider.snapshot()).thenReturn(provider);when(provider.info()).thenReturn(new ModelProvider.Info(true,"fixture","http://127.0.0.1:1",""));when(provider.redactSecret(anyString())).thenAnswer(x->x.getArgument(0));
    project=json.valueToTree(workspace.createProject("Diagram agent synthetic","No real models")).path("id").asLong();var doc=catalog.template("workflow","en");diagram=((Number)diagrams.create(project,"Protocol",doc).get("id")).longValue();
    request=json.createObjectNode().put("protocol_version",1).put("mode","diagram").put("diagram_id",diagram).put("base_revision",1).put("skill_id","workflow").put("diagram_stage","brief").put("share_metadata",true).put("prompt","RNA enters the library.").put("timeout_seconds",30).put("max_tokens",60000).put("request_id",UUID.randomUUID().toString());request.set("doc",doc);
  }
  ModelProvider.Reply reply(String content,String finish){return new ModelProvider.Reply(json.createObjectNode().put("role","assistant").put("content",content),100,100,"fixture",finish);}
  JsonNode waitFor(String id,String phase)throws Exception{for(int i=0;i<250;i++){var r=json.valueToTree(agent.get(project,id));if(r.path("phase").asText().equals(phase)||!Set.of("queued","running").contains(r.path("status").asText()))return r;Thread.sleep(20);}throw new AssertionError("run did not reach "+phase);}
  @Test void factGateProposalReviewDecisionAndRevisionRemainExplicit()throws Exception{
    String brief="{\"brief\":\"RNA workflow\",\"facts\":[{\"text\":\"RNA enters the library.\",\"quote\":\"RNA enters the library.\"}]}";
    var calls=json.createObjectNode().put("role","assistant");var functions=calls.putArray("tool_calls");var f=functions.addObject().put("id","label").put("type","function").putObject("function");f.put("name","update_node").put("arguments","{\"id\":\"n1\",\"label\":\"RNA\"}");f=functions.addObject().put("id","font").put("type","function").putObject("function");f.put("name","set_style").put("arguments","{\"overrides\":{\"font_size_pt\":3}}");
    when(provider.complete(any(),any(),anyInt(),any())).thenReturn(reply(brief,"stop"),new ModelProvider.Reply(calls,100,100,"fixture","tool_calls"),reply("请确认结构和修复。","stop"));
    var first=json.valueToTree(agent.start(project,request));String id=first.path("run_id").asText();var facts=waitFor(id,"awaiting_facts");assertEquals("answered",facts.path("status").asText());assertEquals(1,facts.at("/diagram/facts").size());
    assertEquals(id,json.valueToTree(agent.start(project,request)).path("run_id").asText());verify(provider,times(1)).complete(any(),any(),anyInt(),any());
    var structure=request.deepCopy().put("request_id",UUID.randomUUID().toString()).put("diagram_stage","structure").put("source_prompt",request.path("prompt").asText()).put("brief","RNA workflow").put("session_id",facts.path("session_id").asText());structure.set("facts",facts.at("/diagram/facts"));
    assertThrows(dev.labflow.api.ApiException.class,()->agent.start(project,structure));structure.put("facts_confirmed",true);
    id=json.valueToTree(agent.start(project,structure)).path("run_id").asText();var pending=waitFor(id,"awaiting_render");assertEquals("awaiting_render",pending.path("phase").asText(),pending.toString());
    var render=json.createObjectNode();render.set("doc",pending.at("/proposal/doc"));render.putNull("render_facts");agent.review(project,id,render);
    var proposal=waitFor(id,"proposed");assertEquals("proposed",proposal.path("status").asText(),proposal.toString());assertEquals(1,diagrams.get(project,diagram).get("revision"));assertEquals("RNA",proposal.at("/proposal/doc/nodes/0/label").asText());assertTrue(proposal.path("review").toString().contains("D1"));assertFalse(proposal.path("review").toString().contains("D8:source"));
    var decision=json.createObjectNode().put("outcome","accepted").put("proposal_hash",proposal.path("proposal_hash").asText()).put("review_hash",proposal.at("/review/review_hash").asText());decision.putArray("accepted_fixes");
    var accepted=json.valueToTree(agent.decide(project,id,decision));assertEquals(3,accepted.at("/doc/style/overrides/font_size_pt").asInt());assertEquals(1,diagrams.get(project,diagram).get("revision"));assertEquals("accepted",accepted.path("outcome").asText());
    assertEquals("accepted",json.valueToTree(agent.decide(project,id,decision)).path("outcome").asText());verify(provider,times(3)).complete(any(),any(),anyInt(),any());
    assertFalse(agent.detail(project,id).toString().contains("RNA enters"));
  }
}
