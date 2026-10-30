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
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.*;

@LabflowIntegrationTest
class TeamOptimizationIntegrationTest {
  @Autowired AgentRunService agent;
  @Autowired AgentAuditService audit;
  @Autowired WorkspaceService workspace;
  @Autowired WorkspaceRepository db;
  @Autowired ObjectMapper json;
  @MockitoBean ModelProvider provider;
  @MockitoSpyBean FigureToolService figures;
  @MockitoSpyBean ProcessingService processor;
  TeamRunIntegrationTest fixture;

  @BeforeEach void setup() throws Exception {
    fixture=new TeamRunIntegrationTest();fixture.agent=agent;fixture.audit=audit;
    fixture.workspace=workspace;fixture.db=db;fixture.json=json;fixture.provider=provider;fixture.figures=figures;
    fixture.setup();
    fixture.request.put("max_steps",8);
  }
  @AfterEach void cleanup(){fixture.cleanup();}

  String role(ArrayNode messages){return List.of("coordinator","data","plotter","reviewer").stream()
      .filter(r->TeamPrompts.text(r).equals(messages.get(0).path("content").asText())).findFirst().orElseThrow();}
  ModelProvider.Reply reply(ObjectNode message){return new ModelProvider.Reply(message,50,0,"synthetic-optimization",
      message.has("tool_calls")?"tool_calls":"stop");}
  ObjectNode message(){return json.createObjectNode().put("role","assistant");}
  ObjectNode plan(boolean data){var m=message();var p=json.createObjectNode().put("action","plan").put("message","执行用户明确的请求");
    var tasks=p.putArray("tasks");if(data)tasks.addObject().put("role","data").put("goal","按明确口径汇总");
    tasks.addObject().put("role","plotter").put("goal","只修改指定映射和字号");tasks.addObject().put("role","reviewer").put("goal","核对未请求修改");return m.put("content",p.toString());}
  JsonNode rules() throws Exception {return json.readTree("""
      {"schema_version":1,"mode":"aggregate","groupBy":["epoch"],"metrics":["accuracy"],"filters":[],"sort":[],"missingGroup":"include","error":"sem","observationUnit":"independent repeated run","replicate":"","x":"epoch","group":"","display":"bars"}
      """);}
  void unchanged(JsonNode original){assertEquals(original,json.valueToTree(workspace.data(fixture.project,fixture.source)));
    assertEquals(1,workspace.datasets(fixture.project).size());assertEquals(1,workspace.versions(fixture.project,fixture.chart).size());}

  @Test void plotterCanReadBeforeEditingAndReadAgainWithoutRepreviewing() throws Exception {
    var source=json.valueToTree(workspace.data(fixture.project,fixture.source));var plot=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);var m=message();
      switch(role(messages)){
        case "coordinator"->{return reply(plan(false));}
        case "plotter"->{int step=plot.getAndIncrement();
          if(step==0){fixture.add(m,"get_figure_spec",json.createObjectNode().put("type","line"));fixture.add(m,"get_dataset_profile",json.createObjectNode());}
          else if(step==1)fixture.add(m,"set_style",json.createObjectNode().put("fontSize",18));
          else if(step==2)fixture.add(m,"get_dataset_profile",json.createObjectNode());
          else m.put("content","字号已生成提案，请确认");}
        default->m.put("content","请核对修改范围");
      }return reply(m);}).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());
    assertEquals(18,run.at("/proposal/config/style/fontSize").asInt());assertEquals(4,plot.get());
    // One mutating batch plus final validation; reads do not resubmit the batch.
    verify(figures,times(2)).preview(eq(fixture.project),any());unchanged(source);
  }

  @Test void rejectedProcessingCanBeCorrectedBeforeOneSuccessfulMemoryProposal() throws Exception {
    var source=json.valueToTree(workspace.data(fixture.project,fixture.source));var data=new java.util.concurrent.atomic.AtomicInteger();var plot=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);var m=message();
      switch(role(messages)){
        case "coordinator"->{return reply(plan(true));}
        case "data"->{int step=data.getAndIncrement();
          if(step==0){var invalid=(ObjectNode)rules();invalid.put("mode","passthrough").put("error","keep");fixture.add(m,"propose_processing",invalid);}
          else if(step==1){var feedback=json.readTree(messages.get(messages.size()-1).path("content").asText());assertFalse(feedback.path("ok").asBoolean(true));assertEquals("invalid_processing_rules",feedback.path("error").asText());assertTrue(feedback.path("expected_schema").isObject());fixture.add(m,"propose_processing",rules());}
          else m.put("content","处理口径已校验");}
        case "plotter"->{if(plot.getAndIncrement()==0)fixture.add(m,"map_series",json.createObjectNode().put("seriesId","s1").put("y","accuracy__mean").put("error","accuracy__sem"));else m.put("content","请预览确认");}
        default->m.put("content","按用户指定SEM审阅");
      }return reply(m);}).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());
    assertEquals(3,data.get());assertEquals("aggregate",run.at("/proposal/processing/rules/mode").asText());
    assertEquals("$derived",run.at("/proposal/config/datasetVersionId").asText());unchanged(source);
  }

  @Test void readOnlyPlotterFinishesWithoutInventingAnApplicableProposal() throws Exception {
    var source=json.valueToTree(workspace.data(fixture.project,fixture.source));var plot=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);var m=message();
      if(role(messages).equals("coordinator"))return reply(plan(false));
      if(plot.getAndIncrement()==0){fixture.add(m,"get_dataset_profile",json.createObjectNode());fixture.add(m,"lint_figure",json.createObjectNode());}
      else m.put("content","只查询信息，没有修改图表");return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("answered",run.path("status").asText(),run.toString());assertFalse(run.has("proposal"));
    verify(figures,never()).preview(eq(fixture.project),any());unchanged(source);
  }

  @Test void rejectedDataFieldDoesNotLeakItsValueOrRawExceptionAndCanBeCorrected() throws Exception {
    var data=new java.util.concurrent.atomic.AtomicInteger();var plot=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);var m=message();
      switch(role(messages)){
        case "coordinator"->{return reply(plan(true));}
        case "data"->{int step=data.getAndIncrement();
          if(step==0){var bad=(ObjectNode)rules();bad.set("metrics",json.createArrayNode().add("PRIVATE_MISSING_FIELD"));fixture.add(m,"propose_processing",bad);}
          else if(step==1){String feedback=messages.get(messages.size()-1).path("content").asText();assertFalse(feedback.contains("PRIVATE_MISSING_FIELD"));assertTrue(feedback.contains("invalid_processing_rules"));fixture.add(m,"propose_processing",rules());}
          else m.put("content","按现有字段更正完成");}
        case "plotter"->{if(plot.getAndIncrement()==0)fixture.add(m,"map_series",json.createObjectNode().put("seriesId","s1").put("y","accuracy__mean").put("error","accuracy__sem"));else m.put("content","请预览");}
        default->m.put("content","审查完成");
      }return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());
    assertFalse(run.path("trace").toString().contains("PRIVATE_MISSING_FIELD"));assertEquals(1,workspace.datasets(fixture.project).size());
  }

  @Test void dataRoleCannotUsePlottingToolsThroughTheRecoveryPath() throws Exception {
    var data=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);if(role(messages).equals("coordinator"))return reply(plan(true));
      data.incrementAndGet();var m=message();fixture.add(m,"set_style",json.createObjectNode().put("fontSize",18));return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("failed",run.path("status").asText());assertEquals(1,data.get());assertFalse(run.has("proposal"));
    verify(processor,never()).memoryPreview(anyLong(),anyLong(),any());assertEquals(1,workspace.datasets(fixture.project).size());
  }

  @ParameterizedTest @ValueSource(ints={403,409,500})
  void accessConflictAndServerFailuresRemainTerminal(int status) throws Exception {
    doThrow(new ApiException(status,"PRIVATE_BACKEND_ERROR")).when(processor).memoryPreview(eq(fixture.project),eq(fixture.source),any());
    var data=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);if(role(messages).equals("coordinator"))return reply(plan(true));
      data.incrementAndGet();var m=message();fixture.add(m,"propose_processing",rules());return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("failed",run.path("status").asText());assertEquals(1,data.get());assertFalse(run.has("proposal"));
    assertFalse(run.toString().contains("PRIVATE_BACKEND_ERROR"));assertEquals(1,workspace.datasets(fixture.project).size());
  }

  @Test void secondSuccessfulProcessingProposalRemainsForbidden() throws Exception {
    var data=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);if(role(messages).equals("coordinator"))return reply(plan(true));
      data.incrementAndGet();var m=message();fixture.add(m,"propose_processing",rules());return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("failed",run.path("status").asText());assertEquals(2,data.get());assertFalse(run.has("proposal"));
    verify(processor,times(1)).memoryPreview(eq(fixture.project),eq(fixture.source),any());assertEquals(1,workspace.datasets(fixture.project).size());
  }

  @Test void reviewerReceivesTheRequestAndActualBeforeAfterChanges() throws Exception {
    fixture.request.put("prompt","只把字号改成18，序列名和图例方向保持不变");
    var plot=new java.util.concurrent.atomic.AtomicInteger();var reviewed=new java.util.concurrent.atomic.AtomicBoolean();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);var m=message();
      switch(role(messages)){
        case "coordinator"->{return reply(plan(false));}
        case "plotter"->{if(plot.getAndIncrement()==0){fixture.add(m,"set_style",json.createObjectNode().put("fontSize",18));fixture.add(m,"set_series",json.createObjectNode().put("seriesId","s1").put("name","Latency"));}else m.put("content","请检查提案");}
        case "reviewer"->{var context=json.readTree(messages.get(1).path("content").asText());
          assertEquals(fixture.request.path("prompt").asText(),context.path("request").asText());
          assertEquals("Accuracy",context.at("/original_config_summary/series/0/name").asText());
          assertEquals("Latency",context.at("/config_summary/series/0/name").asText());
          assertFalse(context.path("changes_truncated").asBoolean(true));assertEquals(2,context.path("change_count").asInt());
          assertTrue(context.path("change_summary").toString().contains("/series/0/name"));
          assertFalse(context.toString().contains("PRIVATE_TEAM_FILENAME"));assertFalse(context.has("rows"));
          reviewed.set(true);m.put("content","请求偏差：序列名被额外改为Latency，请勿直接接受。");}
        default->throw new AssertionError("Unexpected data role");
      }return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());assertTrue(reviewed.get());
    assertTrue(run.path("deep_review").asText().contains("请求偏差"));assertEquals("Accuracy",json.valueToTree(workspace.chart(fixture.project,fixture.chart)).path("config").path("series").get(0).path("name").asText());
    assertEquals(TeamPrompts.VERSION,run.path("prompt_version").asText());
  }

  @Test void processingCorrectionStillRespectsTheUserStepBudget() throws Exception {
    fixture.request.put("max_steps",2);var data=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);if(role(messages).equals("coordinator"))return reply(plan(true));
      data.incrementAndGet();var m=message();var invalid=(ObjectNode)rules();invalid.put("mode","passthrough");fixture.add(m,"propose_processing",invalid);return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("incomplete",run.path("status").asText());assertEquals("budget_limited",run.path("phase").asText());
    assertEquals(1,data.get());assertEquals(2,run.path("steps").asInt());assertFalse(run.has("proposal"));
    assertEquals(0,audit.session(fixture.project,run.path("session_id").asText()).path("reserved_budget").asLong());
    assertEquals(1,workspace.datasets(fixture.project).size());
  }

  @ParameterizedTest @ValueSource(strings={"clarify","refuse"})
  void clarificationAndRefusalDoNotForceAnExecutionPlan(String action) throws Exception {
    var count=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{count.incrementAndGet();var plan=json.createObjectNode().put("action",action).put("message","需要补充必要口径或调整请求");plan.putArray("tasks");return reply(message().put("content",plan.toString()));
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("answered",run.path("status").asText());assertFalse(run.has("proposal"));assertEquals(1,count.get());
    verify(figures,never()).preview(eq(fixture.project),any());assertEquals(1,workspace.datasets(fixture.project).size());
  }

  @ParameterizedTest @ValueSource(strings={"图例放右侧","图例放右侧并竖直排列"})
  void executorReceivesOriginalRequestButNotCoordinatorInventedGoal(String prompt) throws Exception {
    fixture.request.put("prompt",prompt);var plot=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);var m=message();String role=role(messages);
      if(role.equals("coordinator")){var p=json.createObjectNode().put("action","plan").put("message","设置图例");p.putArray("tasks").addObject().put("role","plotter").put("goal","图例右侧，强制竖直排列");return reply(m.put("content",p.toString()));}
      if(role.equals("plotter")){var context=json.readTree(messages.get(1).path("content").asText());assertEquals(prompt,context.path("request").asText());assertFalse(context.path("tasks").toString().contains("强制竖直"));
        if(plot.getAndIncrement()==0){var args=json.createObjectNode().put("position","right");if(prompt.contains("竖直"))args.put("orientation","v");fixture.add(m,"set_legend",args);}else m.put("content","请确认图例");}
      else m.put("content","审稿完成");return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());
    assertEquals("right",run.at("/proposal/config/legend/position").asText());
    assertEquals(prompt.contains("竖直")?"v":fixture.config.at("/legend/orientation").asText(),run.at("/proposal/config/legend/orientation").asText());
  }

  @Test void metricChangeAddsVisibleLabelCheckEvenWhenReviewerDoesNotNotice() throws Exception {
    var plot=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{ArrayNode messages=call.getArgument(0);var m=message();String role=role(messages);
      if(role.equals("coordinator"))return reply(plan(false));
      if(role.equals("plotter")&&plot.getAndIncrement()==0)fixture.add(m,"map_series",json.createObjectNode().put("seriesId","s1").put("y","error"));
      else m.put("content","完成");return reply(m);
    }).when(provider).complete(any(),any(),anyInt(),any());
    var run=fixture.done(fixture.start());assertEquals("proposed",run.path("status").asText(),run.toString());
    assertTrue(run.path("text").asText().contains("请核对"));assertTrue(run.path("deep_review").asText().contains("图例名称"));
    assertEquals("Accuracy",run.at("/proposal/config/series/0/name").asText());assertEquals("Accuracy",run.at("/proposal/config/axes/y/title").asText());
  }
}
