package dev.labflow;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.*;
import dev.labflow.agent.team.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.WorkspaceRepository;
import dev.labflow.service.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.*;

@LabflowIntegrationTest
@org.springframework.test.context.TestPropertySource(properties="labflow.agent.team.role-budget-limits-enabled=true")
class TeamRunIntegrationTest {
  @Autowired AgentRunService agent;@Autowired AgentAuditService audit;@Autowired WorkspaceService workspace;@Autowired WorkspaceRepository db;@Autowired ObjectMapper json;
  @MockitoBean ModelProvider provider;@MockitoSpyBean FigureToolService figures;
  long project,chart,source;ObjectNode config,request;String failRole="",blockRole="",overRole="";boolean badMapping;
  String upstreamTimeoutRole="";
  final Map<String,Integer> calls=new ConcurrentHashMap<>();final List<String> inputs=new CopyOnWriteArrayList<>();
  CountDownLatch reached;final AtomicReference<String> runningId=new AtomicReference<>();
  final Set<String> geometryDelivered=ConcurrentHashMap.newKeySet();
  @BeforeEach void setup() throws Exception {
    reached=new CountDownLatch(1);calls.clear();inputs.clear();geometryDelivered.clear();runningId.set(null);
    when(provider.info()).thenReturn(new ModelProvider.Info(true,"synthetic-team-protocol","http://127.0.0.1",""));
    project=json.valueToTree(workspace.createProject("Team synthetic integration","no real model or data")).path("id").asLong();
    source=json.valueToTree(workspace.upload(project,null,"PRIVATE_TEAM_FILENAME.csv","epoch,accuracy,error\n1,0.7,0.01\n1,0.9,0.01\n2,0.6,0.02\n2,0.8,0.02".getBytes(StandardCharsets.UTF_8))).path("id").asLong();
    config=(ObjectNode)json.readTree(getClass().getResourceAsStream("/config-v1.json"));config.put("datasetVersionId",source);
    chart=json.valueToTree(workspace.saveChart(project,null,"Synthetic source",null,config)).path("id").asLong();
    request=json.createObjectNode().put("protocol_version",1).put("mode","team").put("chart_id",chart).put("base_revision",1).put("prompt","每行是独立重复，按epoch分组计算accuracy均值与SEM，并画均值与SEM误差棒").put("share_metadata",true).put("max_tokens",60000).put("timeout_seconds",60);request.set("config",config);
    when(provider.complete(any(),any(),anyInt(),any())).thenAnswer(invocation->{
      ArrayNode messages=invocation.getArgument(0);String system=messages.get(0).path("content").asText();
      String role=List.of("coordinator","data","plotter","reviewer").stream().filter(key->TeamPrompts.text(key).equals(system)).findFirst().orElseThrow();
      inputs.add(messages.toString());int n=calls.merge(role,1,Integer::sum)-1;
      if(blockRole.equals(role)){reached.countDown();new CountDownLatch(1).await();}
      if(upstreamTimeoutRole.equals(role))throw new java.net.http.HttpTimeoutException("PRIVATE_TIMEOUT_BODY");
      if(failRole.equals(role))throw new java.io.IOException("PRIVATE_PROVIDER_ERROR");
      ObjectNode message=json.createObjectNode().put("role","assistant");String finish="stop";
      if(role.equals("coordinator"))message.put("content","{\"action\":\"plan\",\"message\":\"按明确口径处理后绘图\",\"tasks\":[{\"role\":\"data\",\"goal\":\"分组均值SEM\"},{\"role\":\"plotter\",\"goal\":\"映射派生字段\"},{\"role\":\"reviewer\",\"goal\":\"核对图注\"}]}");
      else if(role.equals("data")&&n==0){add(message,"propose_processing",json.readTree("""
          {"schema_version":1,"mode":"aggregate","groupBy":["epoch"],"metrics":["accuracy"],"filters":[],"sort":[{"field":"epoch","direction":"asc"}],"missingGroup":"include","error":"sem","observationUnit":"independent repeated run","replicate":"","x":"epoch","group":"","display":"bars"}
          """));finish="tool_calls";}
      else if(role.equals("plotter")&&n==0){add(message,"map_series",json.createObjectNode().put("seriesId","s1").put("y",badMapping?"invented_missing_field":"accuracy__mean").put("error","accuracy__sem"));add(message,"lint_figure",json.createObjectNode());finish="tool_calls";}
      else message.put("content",role.equals("reviewer")?"请在图注注明 mean ± SEM，各组 n=2；统计解释依赖独立重复假设。":"候选已校验，请预览确认。");
      int tokens=50;if(overRole.equals(role)){
        for(int i=0;i<100&&runningId.get()==null;i++)Thread.sleep(5);
        var state=json.valueToTree(agent.get(project,runningId.get()));tokens=(int)(TeamBudget.ceiling(role,60000,false)-state.path("budget_used").asLong()+1);
      }
      return new ModelProvider.Reply(message,tokens,0,"synthetic-team-protocol",finish);
    });
  }
  void add(ObjectNode message,String name,JsonNode args){ArrayNode out=message.has("tool_calls")?(ArrayNode)message.path("tool_calls"):message.putArray("tool_calls");out.addObject().put("id",UUID.randomUUID().toString()).put("type","function").putObject("function").put("name",name).put("arguments",args.toString());}
  String start(){String id=json.valueToTree(agent.start(project,request)).path("run_id").asText();runningId.set(id);return id;}
  ObjectNode facts() throws Exception {return (ObjectNode)json.readTree("""
      {"render_facts":{"version":1,"canvas":{"width":760,"height":500},"plot":{"x":75,"y":70,"width":650,"height":360},"texts":[],"points":[],"bands":[]}}
      """);}
  JsonNode state(String id) throws Exception {var state=json.valueToTree(agent.get(project,id));if(state.path("phase").asText().equals("awaiting_render")&&geometryDelivered.add(id))agent.review(project,id,facts());return state;}
  JsonNode done(String id) throws Exception {for(int i=0;i<500;i++){var state=state(id);if(!Set.of("queued","running").contains(state.path("status").asText())&&!state.path("phase").asText().equals("awaiting_render"))return state;Thread.sleep(20);}throw new AssertionError("synthetic team timed out");}
  ObjectNode accept(JsonNode run){return json.createObjectNode().put("outcome","accepted").put("proposal_hash",run.path("proposal_hash").asText()).put("review_hash",run.at("/review/review_hash").asText()).set("accepted_fixes",json.createArrayNode());}
  void reached(String id) throws Exception {for(int i=0;i<300&&reached.getCount()!=0;i++){state(id);Thread.sleep(10);}assertEquals(0,reached.getCount(),"did not reach "+blockRole);}
  @AfterEach void cleanup(){if(project==0)return;db.update("DELETE FROM chart_versions WHERE chart_id IN (SELECT id FROM charts WHERE project_id=?)",project);db.update("DELETE FROM charts WHERE project_id=?",project);db.update("DELETE FROM dataset_versions WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id=?)",project);db.update("DELETE FROM datasets WHERE project_id=?",project);db.update("DELETE FROM projects WHERE id=?",project);}
  @Test void fullTeamUsesOneReservationAndOnlyCreatesDerivedDataOnIdempotentApproval() throws Exception {
    var raw=json.valueToTree(workspace.data(project,source));String id=start();var run=done(id);
    assertEquals("proposed",run.path("status").asText(),run.toString());assertTrue(run.path("persisted").asBoolean());assertEquals("$derived",run.at("/proposal/config/datasetVersionId").asText());assertEquals(1,workspace.datasets(project).size());
    assertEquals(4,run.path("roles").size());assertEquals(6,run.path("steps").asInt());assertTrue(run.path("review").isObject());assertTrue(run.at("/review/skipped").isEmpty());
    for(var text:inputs){assertFalse(text.contains("PRIVATE_TEAM_FILENAME"));assertFalse(text.contains("\"rows\""));}
    assertFalse(run.path("trace").toString().contains("PRIVATE_TEAM_FILENAME"));
    var session=audit.session(project,run.path("session_id").asText());assertEquals(0,session.path("reserved_budget").asInt());assertEquals(1,db.query("SELECT run_id FROM agent_runs WHERE project_id=?",project).size());assertTrue(session.path("used_budget").asLong()<=60000);
    var first=json.valueToTree(agent.decide(project,id,accept(run)));long derived=first.at("/config/datasetVersionId").asLong();assertNotEquals(source,derived);assertEquals(2,workspace.datasets(project).size());
    var data=json.valueToTree(workspace.data(project,derived));assertEquals(2,data.path("row_count").asInt());assertEquals(.8,data.at("/rows/0/accuracy__mean").asDouble(),1e-12);assertEquals(.1,data.at("/rows/0/accuracy__sem").asDouble(),1e-12);
    var second=json.valueToTree(agent.decide(project,id,accept(run)));assertEquals(derived,second.at("/config/datasetVersionId").asLong());assertEquals(2,workspace.datasets(project).size());assertEquals(raw,json.valueToTree(workspace.data(project,source)));assertEquals(1,workspace.versions(project,chart).size());
    assertEquals("passed",audit.detail(project,id).at("/processing_commit/final_lint").asText());
  }
  @Test void invalidDerivedMappingFailsInMemoryWithoutCreatingData() throws Exception {badMapping=true;var run=done(start());assertEquals("failed",run.path("status").asText());assertFalse(run.has("proposal"));assertEquals(1,workspace.datasets(project).size());}
  @Test void commitSurvivesFailedFinalLintAndRetryReusesTheSameDerivedDataset() throws Exception {
    String id=start();var run=done(id);var body=accept(run);
    doAnswer(call->{JsonNode envelope=call.getArgument(1);if(envelope.at("/config/datasetVersionId").asLong()!=source)throw new ApiException(409,"Synthetic final lint failure");return call.callRealMethod();}).when(figures).lint(eq(project),any());
    assertEquals(409,assertThrows(ApiException.class,()->agent.decide(project,id,body)).status);assertEquals(2,workspace.datasets(project).size());assertEquals("pending",audit.detail(project,id).path("outcome").asText());assertEquals("failed",audit.detail(project,id).at("/processing_commit/final_lint").asText());
    long committed=audit.detail(project,id).at("/processing_commit/dataset_version_id").asLong();doCallRealMethod().when(figures).lint(eq(project),any());
    assertEquals(committed,json.valueToTree(agent.decide(project,id,body)).at("/config/datasetVersionId").asLong());assertEquals(2,workspace.datasets(project).size());
  }
  @ParameterizedTest @ValueSource(strings={"coordinator","data","plotter","reviewer"}) void cancelInEveryRoleSettlesTheSingleReservation(String role) throws Exception {
    blockRole=role;String id=start();reached(id);agent.cancel(project,id);var run=done(id);assertEquals("cancelled",run.path("status").asText());assertFalse(run.has("proposal"));var session=audit.session(project,run.path("session_id").asText());assertEquals(0,session.path("reserved_budget").asInt());assertEquals(1,session.path("uncertain_runs").asInt());assertEquals(1,workspace.datasets(project).size());
  }
  @ParameterizedTest @ValueSource(strings={"coordinator","data","plotter","reviewer"}) void timeoutInEveryRoleLeavesNoApplicableProposal(String role) throws Exception {
    blockRole=role;request.put("timeout_seconds",1);String id=start();reached(id);var run=done(id);assertEquals("incomplete",run.path("status").asText());assertEquals("timeout",run.path("phase").asText());assertFalse(run.has("proposal"));assertEquals(1,workspace.datasets(project).size());
  }
  @ParameterizedTest @ValueSource(strings={"coordinator","data","plotter","reviewer"}) void failuresAbortRequiredRolesAndOnlyReviewerFailureDegrades(String role) throws Exception {
    failRole=role;var run=done(start());assertEquals(role.equals("reviewer")?"proposed":"failed",run.path("status").asText(),run.toString());assertEquals(role.equals("reviewer"),run.has("proposal"));if(role.equals("reviewer"))assertTrue(run.path("deep_review").asText().contains("深度审稿未完成"));assertFalse(run.toString().contains("PRIVATE_PROVIDER_ERROR"));assertEquals(1,workspace.datasets(project).size());
  }
  @ParameterizedTest @ValueSource(strings={"coordinator","data","plotter"}) void eachRoleCeilingStopsBeforeExhaustingTheOverallReservation(String role) throws Exception {overRole=role;var run=done(start());assertEquals("incomplete",run.path("status").asText());assertEquals("budget_limited",run.path("phase").asText());assertFalse(run.has("proposal"));assertTrue(run.path("budget_used").asLong()<=60000);var session=audit.session(project,run.path("session_id").asText());assertEquals(0,session.path("reserved_budget").asLong());assertEquals(run.path("budget_used").asLong(),session.path("used_budget").asLong());}
  @Test void reviewerAlsoRespectsTheGlobalStepBudget() throws Exception {request.put("max_steps",5);var run=done(start());assertEquals("incomplete",run.path("status").asText());assertEquals("budget_limited",run.path("phase").asText());assertFalse(run.has("proposal"));}
  @Test void reviewerCannotPushUsageBeyondTheOnlyReservation() throws Exception {overRole="reviewer";var run=done(start());assertEquals("incomplete",run.path("status").asText());assertEquals("budget_limited",run.path("phase").asText());assertFalse(run.has("proposal"));var session=audit.session(project,run.path("session_id").asText());assertEquals(60000,session.path("used_budget").asLong());assertEquals(1,session.path("uncertain_runs").asInt());assertTrue(run.path("tokens").asLong()<=60000);assertTrue(run.path("budget_used").asLong()<=60000);}
  @Test void upstreamReviewerTimeoutIsTerminalRatherThanASuccessfulDegradation() throws Exception {upstreamTimeoutRole="reviewer";var run=done(start());assertEquals("incomplete",run.path("status").asText());assertEquals("timeout",run.path("phase").asText());assertFalse(run.has("proposal"));assertFalse(run.toString().contains("PRIVATE_TIMEOUT_BODY"));}
  @Test void standaloneDeepReviewUsesConsentAndTheSameSessionAccounting() throws Exception {request.put("mode","review");request.set("render_facts",facts().path("render_facts"));String id=start();var run=done(id);assertEquals("answered",run.path("status").asText());assertEquals(1,run.path("roles").size());assertEquals("reviewer",run.path("roles").get(0).path("role").asText());assertTrue(run.path("deep_review").asText().contains("SEM"));assertTrue(audit.detail(project,id).path("review").isObject());assertEquals(1,workspace.datasets(project).size());}
  @Test void renderWaitingCanBeCancelledAndReleasesItsOnlyReservation() throws Exception {String id=start();JsonNode run=null;for(int i=0;i<300;i++){run=json.valueToTree(agent.get(project,id));if(run.path("phase").asText().equals("awaiting_render"))break;Thread.sleep(10);}assertNotNull(run);assertEquals("awaiting_render",run.path("phase").asText());assertFalse(run.path("persisted").asBoolean());assertEquals("cancelled",json.valueToTree(agent.cancel(project,id)).path("status").asText());assertEquals(0,audit.session(project,run.path("session_id").asText()).path("reserved_budget").asLong());assertEquals(1,workspace.datasets(project).size());}
  @Test void requestIdempotencyDoesNotReserveOrRunTheTeamTwice() throws Exception {request.put("request_id",UUID.randomUUID().toString());String id=start();var first=done(id);var repeated=json.valueToTree(agent.start(project,request));assertEquals(id,repeated.path("run_id").asText());assertEquals(first.path("tokens"),repeated.path("tokens"));assertEquals(6,calls.values().stream().mapToInt(Integer::intValue).sum());assertEquals(1,db.query("SELECT run_id FROM agent_runs WHERE project_id=?",project).size());}
  @Test void processingProposalRefinementPreservesTheRulesAndReusesTheSession() throws Exception {String parent=start();var first=done(parent);calls.clear();request.put("parent_run_id",parent).put("prompt","保留分组均值SEM的处理与映射，再核查图注");String child=start();var next=done(child);assertEquals("proposed",next.path("status").asText(),next.toString());assertEquals(first.path("session_id"),next.path("session_id"));assertEquals("superseded",audit.detail(project,parent).path("outcome").asText());assertEquals(first.at("/proposal/processing/rules"),next.at("/proposal/processing/rules"));assertEquals(1,workspace.datasets(project).size());assertEquals("accepted",json.valueToTree(agent.decide(project,child,accept(next))).path("outcome").asText());assertEquals(2,workspace.datasets(project).size());}
  @Test void coordinatorCanClarifyWithoutRunningAnyExpertOrHandingOutAProposal() throws Exception {doReturn(new ModelProvider.Reply(json.createObjectNode().put("role","assistant").put("content","{\"action\":\"clarify\",\"message\":\"请确认每行观测单位\",\"tasks\":[]}"),50,20,"fixture","stop")).when(provider).complete(any(),any(),anyInt(),any());var run=done(start());assertEquals("answered",run.path("status").asText());assertFalse(run.has("proposal"));assertEquals(1,run.path("roles").size());assertEquals(1,workspace.datasets(project).size());}
  @Test void coordinatorCannotInvokePlottingTools() throws Exception {var message=json.createObjectNode().put("role","assistant");add(message,"set_style",json.createObjectNode().put("fontSize",24));doReturn(new ModelProvider.Reply(message,50,20,"fixture","tool_calls")).when(provider).complete(any(),any(),anyInt(),any());var run=done(start());assertEquals("failed",run.path("status").asText());assertFalse(run.has("proposal"));assertEquals(json.readTree(config.toString()),json.readTree(json.valueToTree(workspace.chart(project,chart)).path("config").toString()));}
  @Test void aStyleOnlyPlanSkipsTheDataRoleAndCannotCreateADataset() throws Exception {
    doAnswer(call->{ArrayNode messages=call.getArgument(0);String system=messages.get(0).path("content").asText();var message=json.createObjectNode().put("role","assistant");String finish="stop";
      if(system.equals(TeamPrompts.text("coordinator")))message.put("content","{\"action\":\"plan\",\"message\":\"只调整字体\",\"tasks\":[{\"role\":\"plotter\",\"goal\":\"字号18\"},{\"role\":\"reviewer\",\"goal\":\"检查图注\"}]}");
      else if(system.equals(TeamPrompts.text("plotter"))&&messages.findValuesAsText("role").stream().noneMatch("tool"::equals)){add(message,"set_style",json.createObjectNode().put("fontSize",18));finish="tool_calls";}else message.put("content","请预览确认");return new ModelProvider.Reply(message,50,20,"fixture",finish);}).when(provider).complete(any(),any(),anyInt(),any());
    var run=done(start());assertEquals("proposed",run.path("status").asText(),run.toString());assertFalse(run.path("proposal").has("processing"));assertEquals(3,run.path("roles").size());assertEquals(1,workspace.datasets(project).size());
  }
}
