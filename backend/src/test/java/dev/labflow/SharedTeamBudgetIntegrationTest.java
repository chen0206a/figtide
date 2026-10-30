package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.*;
import dev.labflow.agent.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.WorkspaceRepository;
import dev.labflow.service.*;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.util.ReflectionTestUtils;

@LabflowIntegrationTest
class SharedTeamBudgetIntegrationTest {
  @Autowired AgentRunService agent;@Autowired AgentAuditService audit;@Autowired WorkspaceService workspace;
  @Autowired WorkspaceRepository db;@Autowired ObjectMapper json;
  @Autowired dev.labflow.agent.team.TeamDraftService drafts;
  @Autowired dev.labflow.agent.team.TeamDecisionService decisions;
  @Autowired dev.labflow.review.ProposalReviewService reviews;
  @MockitoBean ModelProvider provider;@MockitoSpyBean FigureToolService figures;
  TeamRunIntegrationTest fixture;
  @BeforeEach void setup() throws Exception {
    fixture=new TeamRunIntegrationTest();fixture.agent=agent;fixture.audit=audit;fixture.workspace=workspace;fixture.db=db;fixture.json=json;fixture.provider=provider;fixture.figures=figures;fixture.setup();
  }
  @AfterEach void cleanup(){fixture.cleanup();}
  @Test void defaultSharedBudgetAllowsCoordinatorBeyondTheOldFifteenPercent() throws Exception {
    fixture.overRole="coordinator";var run=fixture.done(fixture.start());
    assertEquals("proposed",run.path("status").asText(),run.toString());assertTrue(run.path("role_budget_percentages").isNull());
    assertTrue(run.path("tokens").asLong()>9000);assertTrue(run.path("budget_used").asLong()<=60000);
    var session=audit.session(fixture.project,run.path("session_id").asText());assertEquals(0,session.path("reserved_budget").asLong());assertEquals(run.path("budget_used").asLong(),session.path("used_budget").asLong());
    assertEquals(1,workspace.datasets(fixture.project).size());assertEquals(1,workspace.versions(fixture.project,fixture.chart).size());
  }
  @Test void explicitUserPercentagesStillEnforceTheirChosenQuota() throws Exception {
    fixture.overRole="coordinator";fixture.request.set("role_budget_percentages",json.readTree("{\"coordinator\":15,\"data\":30,\"plotter\":40,\"reviewer\":15}"));
    var run=fixture.done(fixture.start());assertEquals("incomplete",run.path("status").asText());assertEquals("budget_limited",run.path("phase").asText());assertFalse(run.has("proposal"));
  }
  @Test void userCanGiveCoordinatorMoreOfTheSharedRun() throws Exception {
    fixture.overRole="coordinator";fixture.request.set("role_budget_percentages",json.readTree("{\"coordinator\":50,\"data\":10,\"plotter\":30,\"reviewer\":10}"));
    var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());assertEquals(50,run.at("/role_budget_percentages/coordinator").asInt());
  }
  @Test void invalidSharesAndEvaluationOverridesCannotBeSentOverHttp() throws Exception {
    fixture.request.set("role_budget_percentages",json.readTree("{\"coordinator\":15,\"data\":30,\"plotter\":40,\"reviewer\":14}"));
    assertEquals(400,assertThrows(ApiException.class,()->agent.start(fixture.project,fixture.request)).status);
    fixture.request.remove("role_budget_percentages");fixture.request.put("execution_policy","evaluation_unbounded");
    assertEquals(400,assertThrows(ApiException.class,()->agent.start(fixture.project,fixture.request)).status);verify(provider,never()).complete(any(),any(),anyInt(),any());
  }
  @Test void explicitEvaluationPolicyBypassesTokenRoleStepAndOverallTimeLimits() throws Exception {
    var first=new AtomicBoolean(true);
    ModelProvider delayed=new ModelProvider(){
      public Info info(){return provider.info();}
      public Reply complete(com.fasterxml.jackson.databind.node.ArrayNode messages,com.fasterxml.jackson.databind.node.ArrayNode tools,int max,Duration timeout) throws Exception {if(first.getAndSet(false))Thread.sleep(1100);return provider.complete(messages,tools,max,timeout);}
    };
    var unbounded=new AgentRunService(delayed,figures,workspace,json,audit,AgentExecutionPolicy.EVALUATION_UNBOUNDED);
    ReflectionTestUtils.setField(unbounded,"teamDrafts",drafts);ReflectionTestUtils.setField(unbounded,"teamDecisions",decisions);ReflectionTestUtils.setField(unbounded,"proposalReviews",reviews);
    fixture.agent=unbounded;fixture.overRole="coordinator";fixture.request.put("max_tokens",2000).put("max_steps",1).put("timeout_seconds",1);
    try{var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());assertFalse(run.path("budget_limit_enabled").asBoolean(true));assertTrue(run.path("tokens").asLong()>9000);assertTrue(run.path("steps").asInt()>1);assertTrue(run.path("latency_ms").asLong()>1000);assertEquals(0,audit.session(fixture.project,run.path("session_id").asText()).path("reserved_budget").asLong());}finally{unbounded.close();}
  }
  @Test void sharedUserBudgetStillStopsAtTheOnlyRunReservation() throws Exception {
    fixture.overRole="reviewer";var run=fixture.done(fixture.start());assertEquals("incomplete",run.path("status").asText());assertEquals("budget_limited",run.path("phase").asText());assertFalse(run.has("proposal"));assertEquals(60000,audit.session(fixture.project,run.path("session_id").asText()).path("used_budget").asLong());
  }
  @Test void singleAssistantEvaluationAlsoIgnoresTheUserRunLimits() throws Exception {
    var count=new java.util.concurrent.atomic.AtomicInteger();
    ModelProvider scripted=new ModelProvider(){
      public Info info(){return new Info(true,"synthetic-unrestricted","offline://test","");}
      public Reply complete(com.fasterxml.jackson.databind.node.ArrayNode messages,com.fasterxml.jackson.databind.node.ArrayNode tools,int max,Duration timeout) throws Exception {
        var message=json.createObjectNode().put("role","assistant");
        if(count.getAndIncrement()==0){Thread.sleep(1100);fixture.add(message,"set_style",json.createObjectNode().put("fontSize",18));return new Reply(message,9500,0,"synthetic-unrestricted","tool_calls");}
        return new Reply(message.put("content","请预览确认，未保存"),50,0,"synthetic-unrestricted","stop");
      }
    };
    var unbounded=new AgentRunService(scripted,figures,workspace,json,audit,AgentExecutionPolicy.EVALUATION_UNBOUNDED);
    fixture.agent=unbounded;fixture.request.put("mode","single").put("max_tokens",2000).put("max_steps",1).put("timeout_seconds",1);
    try{var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());assertEquals(2,run.path("steps").asInt());assertEquals(9550,run.path("tokens").asLong());assertFalse(run.path("budget_limit_enabled").asBoolean(true));assertEquals(18,run.at("/proposal/config/style/fontSize").asInt());}finally{unbounded.close();}
  }
}
