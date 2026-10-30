package dev.labflow;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.*;
import dev.labflow.service.WorkspaceService;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.*;

@LabflowIntegrationTest
class ProposalReviewIntegrationTest {
  @Autowired AgentRunService agent;@Autowired AgentAuditService audit;@Autowired WorkspaceService workspace;
  @Autowired WorkspaceRepository workspaceDb;@Autowired ObjectMapper json;
  @MockitoBean ModelProvider provider;@MockitoSpyBean AgentAuditRepository db;
  long project,chart;ObjectNode config,request;
  @BeforeEach void setup() throws Exception {
    when(provider.info()).thenReturn(new ModelProvider.Info(true,"review-protocol-fixture","http://127.0.0.1",""));
    project=json.valueToTree(workspace.createProject("Proposal review synthetic","local fixture only")).path("id").asLong();
    long dataset=json.valueToTree(workspace.upload(project,null,"PRIVATE_FILENAME.csv","epoch,accuracy,error\n1,0.7,0.01\n2,0.8,0.02".getBytes(StandardCharsets.UTF_8))).path("id").asLong();
    config=(ObjectNode)json.readTree(getClass().getResourceAsStream("/config-v1.json"));config.put("datasetVersionId",dataset);
    config.putObject("publication").put("enabled",true).put("widthMm",88).put("fontPt",4).put("dpi",300);
    ((ObjectNode)config.path("legend")).put("position","right");((ObjectNode)config.path("series").get(0)).put("width",.5);
    chart=json.valueToTree(workspace.saveChart(project,null,"Current synthetic",null,config)).path("id").asLong();
    request=json.createObjectNode().put("protocol_version",1).put("chart_id",chart).put("base_revision",1).put("prompt","请把图例放上方").put("share_metadata",true);request.set("config",config);
    var message=json.createObjectNode().put("role","assistant");var call=message.putArray("tool_calls").addObject().put("id","synthetic-tool-call").put("type","function");
    call.putObject("function").put("name","set_legend").put("arguments","{\"position\":\"top\"}");
    when(provider.complete(any(),any(),anyInt(),any())).thenReturn(new ModelProvider.Reply(message,40,20,"fixture","tool_calls"),new ModelProvider.Reply(json.createObjectNode().put("role","assistant").put("content","请确认"),20,10,"fixture","stop"));
  }
  JsonNode run() throws Exception {
    String id=json.valueToTree(agent.start(project,request)).path("run_id").asText();
    for(int i=0;i<300;i++){var result=json.valueToTree(agent.get(project,id));if(!Set.of("queued","running").contains(result.path("status").asText())){assertEquals("proposed",result.path("status").asText());return result;}Thread.sleep(20);}throw new AssertionError("fixture timed out");
  }
  ObjectNode facts() throws Exception{return (ObjectNode)json.readTree("""
      {"render_facts":{"version":1,"canvas":{"width":760,"height":500},"plot":{"x":75,"y":70,"width":650,"height":360},"legend":{"x":100,"y":100,"width":120,"height":50},"texts":[],"points":[{"trace":0,"x":110,"y":110}],"bands":[]}}
      """);}
  JsonNode review(JsonNode run) throws Exception {return json.valueToTree(agent.review(project,run.path("run_id").asText(),facts()));}
  ObjectNode accept(JsonNode run,JsonNode report,String... ids){var body=json.createObjectNode().put("outcome","accepted").put("proposal_hash",run.path("proposal_hash").asText()).put("review_hash",report.path("review_hash").asText());body.set("accepted_fixes",json.valueToTree(ids));return body;}
  @AfterEach void cleanup(){
    if(project==0)return;
    workspaceDb.update("DELETE FROM chart_versions WHERE chart_id IN (SELECT id FROM charts WHERE project_id=?)",project);
    workspaceDb.update("DELETE FROM charts WHERE project_id=?",project);
    workspaceDb.update("DELETE FROM dataset_versions WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id=?)",project);
    workspaceDb.update("DELETE FROM datasets WHERE project_id=?",project);
    workspaceDb.update("DELETE FROM projects WHERE id=?",project);
  }
  @Test void reviewIsIdempotentFreeAndDoesNotOverruleTheRequestedLegend() throws Exception {
    var run=run();var session=audit.session(project,run.path("session_id").asText());var report=review(run);assertEquals(report,review(run));
    assertEquals(session,audit.session(project,run.path("session_id").asText()));
    JsonNode legend=null;for(var issue:report.path("issues"))if(issue.path("rule").asText().equals("R7"))legend=issue;
    assertNotNull(legend);assertFalse(legend.path("fixable").asBoolean());assertTrue(legend.path("detail").asText().contains("与你这次的要求冲突"));
    assertEquals(report,audit.detail(project,run.path("run_id").asText()).path("review"));
    verify(db,times(1)).storeReview(eq(project),eq(run.path("run_id").asText()),anyString());
    verify(provider,times(2)).complete(any(),any(),anyInt(),any());assertEquals(1,workspace.versions(project,chart).size());
  }
  @Test void selectedRepairsAreAtomicBoundAndIdempotentWithoutSaving() throws Exception {
    var run=run();var report=review(run);String id=run.path("run_id").asText();var body=accept(run,report,"R1:font");
    var first=json.valueToTree(agent.decide(project,id,body));assertEquals("accepted",first.path("outcome").asText());
    assertEquals(6.5,first.at("/config/publication/fontPt").asDouble());assertEquals("top",first.at("/config/legend/position").asText());assertEquals(.5,first.at("/config/series/0/width").asDouble());
    assertEquals(64,first.path("final_config_hash").asText().length());
    assertEquals(first,json.valueToTree(agent.decide(project,id,body)));
    assertEquals(409,assertThrows(ApiException.class,()->agent.decide(project,id,accept(run,report,"R2:s1"))).status);
    assertEquals(409,assertThrows(ApiException.class,()->agent.review(project,id,facts())).status);
    assertEquals(1,workspace.versions(project,chart).size());
  }
  @Test void staleReviewUnknownRepairAndRevisionConflictAre409() throws Exception {
    var run=run();var report=review(run);String id=run.path("run_id").asText();
    assertEquals(409,assertThrows(ApiException.class,()->agent.decide(project,id,accept(run,report,"R7:legend"))).status);
    assertEquals(409,assertThrows(ApiException.class,()->agent.decide(project,id,accept(run,report,"unknown"))).status);
    var stale=accept(run,report,"R1:font").put("review_hash","stale");assertEquals(409,assertThrows(ApiException.class,()->agent.decide(project,id,stale)).status);
    workspace.saveChart(project,chart,"Changed saved revision",1,config);
    assertEquals(409,assertThrows(ApiException.class,()->agent.decide(project,id,accept(run,report,"R1:font"))).status);
    assertEquals("pending",audit.detail(project,id).path("outcome").asText());
  }
  @Test void repairAuditFailureRollsBackTheExistingDecision() throws Exception {
    var run=run();var report=review(run);String id=run.path("run_id").asText();var body=accept(run,report,"R1:font");
    doThrow(new IllegalStateException("synthetic storage failure")).when(db).storeAcceptedFixes(eq(project),eq(id),anyString());
    assertThrows(IllegalStateException.class,()->agent.decide(project,id,body));
    assertEquals("pending",audit.detail(project,id).path("outcome").asText());assertFalse(audit.detail(project,id).has("accepted_fixes"));
    doCallRealMethod().when(db).storeAcceptedFixes(eq(project),eq(id),anyString());
    assertEquals("accepted",json.valueToTree(agent.decide(project,id,body)).path("outcome").asText());
  }
}
