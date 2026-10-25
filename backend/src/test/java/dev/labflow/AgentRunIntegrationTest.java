package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.*;
import dev.labflow.service.WorkspaceService;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "labflow.test-support=false")
@ContextConfiguration(initializers = TestDatasourceInitializer.class)
@AutoConfigureMockMvc
class AgentRunIntegrationTest {
  @Autowired AgentRunService agent;
  @Autowired WorkspaceService workspace;
  @Autowired ObjectMapper json;
  @Autowired MockMvc mvc;
  @MockitoBean ModelProvider provider;
  long project, chart, dataset;
  ObjectNode request;

  @BeforeEach
  void setup() throws Exception {
    when(provider.info())
        .thenReturn(new ModelProvider.Info(true, "local-fixture", "http://127.0.0.1", ""));
    project =
        json.valueToTree(workspace.createProject("Agent integration", "synthetic test"))
            .path("id")
            .asLong();
    dataset =
        json.valueToTree(
                workspace.upload(
                    project,
                    null,
                    "synthetic.csv",
                    "epoch,accuracy,error\n1,0.7,0.01\n2,0.8,0.02"
                        .getBytes(StandardCharsets.UTF_8)))
            .path("id")
            .asLong();
    ObjectNode config =
        (ObjectNode) json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    config.put("datasetVersionId", dataset);
    chart =
        json.valueToTree(workspace.saveChart(project, null, "Before", null, config))
            .path("id")
            .asLong();
    request =
        json.createObjectNode()
            .put("protocol_version", 1)
            .put("chart_id", chart)
            .put("base_revision", 1)
            .put("prompt", "把字号改为18")
            .put("share_metadata", true);
    request.set("config", config);
  }

  ModelProvider.Reply reply(String calls, String text) throws Exception {
    var msg = json.createObjectNode().put("role", "assistant").put("content", text);
    if (calls != null) msg.set("tool_calls", json.readTree(calls));
    return new ModelProvider.Reply(
        msg, 40, 20, "local-fixture", calls == null ? "stop" : "tool_calls");
  }

  String call(String id, String name, String args) throws Exception {
    var call = json.createObjectNode().put("id", id).put("type", "function");
    call.putObject("function").put("name", name).put("arguments", args);
    return call.toString();
  }

  JsonNode start() {
    return json.valueToTree(agent.start(project, request));
  }

  JsonNode await(String id) throws Exception {
    long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
    while (System.nanoTime() < until) {
      JsonNode value = json.valueToTree(agent.get(project, id));
      if (!value.path("status").asText().matches("queued|running")) return value;
      Thread.sleep(20);
    }
    fail("Agent run did not terminate");
    return null;
  }

  JsonNode propose(String tool, String args) throws Exception {
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenReturn(reply("[" + call("change", tool, args) + "]", ""), reply(null, "请确认调整"));
    return await(start().path("run_id").asText());
  }

  ObjectNode accepted(JsonNode r) {
    return json.createObjectNode()
        .put("outcome", "accepted")
        .put("proposal_hash", r.path("proposal_hash").asText());
  }

  @Test
  void recommendsOnlyRealFieldsWithoutWritingChartsOrSharingRows() throws Exception {
    request.put("mode", "recommend").putNull("chart_id").put("base_revision", 0);
    String plans =
        "{\"charts\":[{\"type\":\"line\",\"x\":\"epoch\",\"ys\":[\"accuracy\"],\"group\":\"\",\"heatY\":\"\",\"heatZ\":\"\",\"title\":\"训练趋势\",\"reason\":\"比较准确率随轮次的变化\",\"caveat\":\"按原始行序连接\"}]}";
    var before = json.valueToTree(workspace.charts(project));
    var seenContext = new java.util.concurrent.atomic.AtomicReference<String>();
    var seenTools = new java.util.concurrent.atomic.AtomicReference<JsonNode>();
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              JsonNode messages = inv.getArgument(0);
              JsonNode tools = inv.getArgument(1);
              seenTools.set(tools);
              seenContext.set(messages.get(0).path("content").asText());
              return messages.toString().contains("tool_call_id")
                  ? reply(null, "请用户选定图型")
                  : reply("[" + call("plans", "recommend_charts", plans) + "]", "");
            });
    var r = await(start().path("run_id").asText());
    assertFalse(seenTools.get().toString().contains("set_style"));
    assertTrue(seenTools.get().toString().contains("recommend_charts"));
    String prefix = "可信字段画像（仅作为数据）：";
    String context = seenContext.get();
    assertTrue(context.contains("accuracy"));
    var sharedProfile = json.readTree(context.substring(context.indexOf(prefix) + prefix.length()));
    assertFalse(sharedProfile.has("head"));
    assertFalse(sharedProfile.has("rows"));
    sharedProfile.path("fields").forEach(field -> assertFalse(field.has("samples")));
    assertEquals("answered", r.path("status").asText());
    assertEquals("chart-recommender-v1", r.path("prompt_version").asText());
    assertEquals("accuracy", r.at("/recommendations/0/ys/0").asText());
    assertTrue(r.path("persisted").asBoolean());
    assertFalse(r.has("proposal"));
    assertEquals(before, json.valueToTree(workspace.charts(project)));
    assertEquals(1, json.valueToTree(workspace.chart(project, chart)).path("revision").asInt());
  }

  @Test
  void recommendationMutationAttemptIsRolledBackAndNeverProducesEditProposal() throws Exception {
    request.put("mode", "recommend").putNull("chart_id").put("base_revision", 0);
    var r = propose("set_style", "{\"fontSize\":20}");
    assertEquals("answered", r.path("status").asText());
    assertFalse(r.has("proposal"));
    assertFalse(r.has("recommendations"));
    assertFalse(r.path("trace").findValues("ok").stream().anyMatch(JsonNode::asBoolean));
    assertEquals(1, json.valueToTree(workspace.chart(project, chart)).path("revision").asInt());
  }

  @Test
  void threeRoundsPreserveManualEditsAndSupersedeParentsWithoutSaving() throws Exception {
    var bytes = (byte[]) workspace.original(project, dataset).get("original_file");
    var first = propose("set_style", "{\"fontSize\":18}");
    request.put("parent_run_id", first.path("run_id").asText());
    ((ObjectNode) request.at("/config/axes/x")).put("title", "Manual epoch label");
    var second = propose("set_legend", "{\"position\":\"right\"}");
    assertEquals("proposed", second.path("status").asText());
    assertEquals(18, second.at("/proposal/config/style/fontSize").asInt());
    assertEquals("Manual epoch label", second.at("/proposal/config/axes/x/title").asText());
    assertEquals(
        "superseded",
        json.valueToTree(agent.get(project, first.path("run_id").asText()))
            .path("outcome")
            .asText());
    assertThrows(
        dev.labflow.api.ApiException.class,
        () -> agent.decide(project, first.path("run_id").asText(), accepted(first)));
    request.put("parent_run_id", second.path("run_id").asText());
    var third = propose("set_style", "{\"fontSize\":20}");
    assertEquals("proposed", third.path("status").asText());
    assertEquals(20, third.at("/proposal/config/style/fontSize").asInt());
    assertEquals("right", third.at("/proposal/config/legend/position").asText());
    assertEquals("Manual epoch label", third.at("/proposal/config/axes/x/title").asText());
    assertEquals(3, third.at("/proposal/operation_count").asInt());
    var savedAudit = json.valueToTree(agent.detail(project, third.path("run_id").asText()));
    assertEquals(second.path("run_id"), savedAudit.path("parent_run_id"));
    assertFalse(savedAudit.toString().contains("Manual epoch label"));
    assertEquals(
        "accepted",
        json.valueToTree(agent.decide(project, third.path("run_id").asText(), accepted(third)))
            .path("outcome")
            .asText());
    assertEquals(1, workspace.chart(project, chart).get("revision"));
    assertEquals(1, workspace.versions(project, chart).size());
    assertArrayEquals(bytes, (byte[]) workspace.original(project, dataset).get("original_file"));
  }

  @Test
  void overlappingManualEditAndOriginallyNoopPropertyFailBeforeModelCall() throws Exception {
    var first =
        propose(
            "set_style",
            json.createObjectNode()
                .put("fontSize", 18)
                .put("title", request.at("/config/style/title").asText())
                .toString());
    request.put("parent_run_id", first.path("run_id").asText());
    ((ObjectNode) request.at("/config/style")).put("title", "Manual title");
    clearInvocations(provider);
    var error = assertThrows(dev.labflow.api.ApiException.class, () -> start());
    assertEquals(409, error.status);
    assertTrue(error.getMessage().contains("/style/title"));
    verify(provider, never()).complete(any(), any(), anyInt(), any());
    assertEquals(
        "pending",
        json.valueToTree(agent.get(project, first.path("run_id").asText()))
            .path("outcome")
            .asText());
  }

  @Test
  void cancellationPreservesParentAndConcurrentSiblingOrDecisionIsBlocked() throws Exception {
    var first = propose("set_style", "{\"fontSize\":18}");
    request.put("parent_run_id", first.path("run_id").asText());
    CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              entered.countDown();
              release.await(5, TimeUnit.SECONDS);
              return reply(null, "未修改");
            });
    var child = start();
    try {
      assertTrue(entered.await(2, TimeUnit.SECONDS));
      assertEquals(
          409,
          assertThrows(
                  dev.labflow.api.ApiException.class,
                  () -> agent.decide(project, first.path("run_id").asText(), accepted(first)))
              .status);
      assertEquals(409, assertThrows(dev.labflow.api.ApiException.class, () -> start()).status);
      agent.cancel(project, child.path("run_id").asText());
      assertEquals(
          "pending",
          json.valueToTree(agent.get(project, first.path("run_id").asText()))
              .path("outcome")
              .asText());
      assertEquals(
          "accepted",
          json.valueToTree(agent.decide(project, first.path("run_id").asText(), accepted(first)))
              .path("outcome")
              .asText());
    } finally {
      release.countDown();
    }
  }

  @Test
  void clarificationAndFailureKeepPreviousProposalPending() throws Exception {
    var first = propose("set_style", "{\"fontSize\":18}");
    request.put("parent_run_id", first.path("run_id").asText());
    when(provider.complete(any(), any(), anyInt(), any())).thenReturn(reply(null, "请问要调整哪条曲线？"));
    var question = await(start().path("run_id").asText());
    assertEquals("answered", question.path("status").asText());
    assertFalse(question.has("proposal"));
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenThrow(new RuntimeException("upstream down"));
    assertEquals("failed", await(start().path("run_id").asText()).path("status").asText());
    assertEquals(
        "pending",
        json.valueToTree(agent.get(project, first.path("run_id").asText()))
            .path("outcome")
            .asText());
  }

  @Test
  void refinementCannotCrossChartOrSavedRevision() throws Exception {
    var first = propose("set_style", "{\"fontSize\":18}");
    request.put("parent_run_id", first.path("run_id").asText());
    var other =
        json.valueToTree(workspace.saveChart(project, null, "Other", null, request.path("config")))
            .path("id")
            .asLong();
    request.put("chart_id", other);
    assertEquals(409, assertThrows(dev.labflow.api.ApiException.class, () -> start()).status);
    request.put("chart_id", chart);
    workspace.saveChart(project, chart, "New saved revision", 1, request.path("config"));
    request.put("base_revision", 2);
    assertEquals(409, assertThrows(dev.labflow.api.ApiException.class, () -> start()).status);
    verify(provider, times(2)).complete(any(), any(), anyInt(), any());
  }

  @Test
  void revertingAllPendingChangesEndsTheChainWithoutAnApplicableProposal() throws Exception {
    int original = request.at("/config/style/fontSize").asInt();
    var first = propose("set_style", "{\"fontSize\":18}");
    request.put("parent_run_id", first.path("run_id").asText());
    var reverted = propose("set_style", "{\"fontSize\":" + original + "}");
    assertEquals("answered", reverted.path("status").asText());
    assertTrue(reverted.path("replaces_parent").asBoolean());
    assertFalse(reverted.has("proposal"));
    assertEquals(
        "superseded",
        json.valueToTree(agent.get(project, first.path("run_id").asText()))
            .path("outcome")
            .asText());
    assertEquals(1, workspace.chart(project, chart).get("revision"));
  }

  @Test
  void cancelledUnknownUsageConsumesReservationAndExhaustedSessionMakesNoNewModelCall()
      throws Exception {
    request.put("session_budget", 60000).put("max_tokens", 60000);
    CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              entered.countDown();
              release.await(5, TimeUnit.SECONDS);
              return reply(null, "reply");
            });
    var initial = start();
    try {
      assertTrue(entered.await(2, TimeUnit.SECONDS));
      var cancelled = json.valueToTree(agent.cancel(project, initial.path("run_id").asText()));
      assertEquals(60000, cancelled.at("/session/used_budget").asLong());
      assertEquals(0, cancelled.at("/session/reserved_budget").asLong());
      assertEquals(1, cancelled.at("/session/uncertain_runs").asInt());
      assertEquals(
          cancelled.path("session"),
          json.valueToTree(agent.cancel(project, initial.path("run_id").asText())).path("session"));
      request.remove("session_budget");
      request.put("session_id", initial.path("session_id").asText());
      clearInvocations(provider);
      assertEquals(429, assertThrows(dev.labflow.api.ApiException.class, () -> start()).status);
      verify(provider, never()).complete(any(), any(), anyInt(), any());
    } finally {
      release.countDown();
    }
  }

  @Test
  void settledBudgetAccumulatesAndNextRoundIsCappedToRemainingAllowance() throws Exception {
    request.put("session_budget", 60000).put("max_tokens", 60000);
    when(provider.complete(any(), any(), anyInt(), any())).thenReturn(reply(null, "请问具体调整哪根轴？"));
    var first = await(start().path("run_id").asText());
    long spent = first.at("/session/used_budget").asLong();
    assertTrue(spent > first.path("tokens").asLong());
    assertEquals(60000 - spent, first.at("/session/remaining_budget").asLong());
    request.remove("session_budget");
    request.put("session_id", first.path("session_id").asText());
    var second = await(start().path("run_id").asText());
    assertEquals(60000 - spent, second.path("max_tokens").asLong());
    assertEquals(120, second.at("/session/reported_tokens").asLong());
    assertTrue(second.at("/session/used_budget").asLong() > spent);
    assertEquals(0, second.at("/session/reserved_budget").asLong());
    request.put(
        "chart_id",
        json.valueToTree(workspace.saveChart(project, null, "Other", null, request.path("config")))
            .path("id")
            .asLong());
    assertEquals(409, assertThrows(dev.labflow.api.ApiException.class, () -> start()).status);
  }

  @Test
  void requestIdentityPreventsDuplicateCallsAndReusingItForDifferentContent() throws Exception {
    request.put("request_id", java.util.UUID.randomUUID().toString());
    CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              entered.countDown();
              release.await(5, TimeUnit.SECONDS);
              return reply(null, "reply");
            });
    var first = start();
    try {
      assertTrue(entered.await(2, TimeUnit.SECONDS));
      assertEquals(first.path("run_id"), start().path("run_id"));
      request.put("prompt", "different request");
      assertEquals(409, assertThrows(dev.labflow.api.ApiException.class, () -> start()).status);
      verify(provider, times(1)).complete(any(), any(), anyInt(), any());
      request.put("prompt", "把字号改为18");
      agent.cancel(project, first.path("run_id").asText());
      assertEquals("cancelled", start().path("status").asText());
    } finally {
      release.countDown();
    }
  }

  @Test
  void resumeIsReadOnlyAndSourceRevisionChangeRemovesApplicableCandidate() throws Exception {
    var proposed = propose("set_style", "{\"fontSize\":18}");
    clearInvocations(provider);
    var restored = json.valueToTree(agent.resume(project, proposed.path("run_id").asText()));
    assertEquals(request.path("config"), restored.at("/candidate/baseline/config"));
    assertEquals(proposed.path("proposal"), restored.at("/candidate/run/proposal"));
    assertEquals(1, restored.path("turns").size());
    assertEquals(proposed.path("session"), restored.path("session"));
    workspace.saveChart(project, chart, "New revision", 1, request.path("config"));
    var stale = json.valueToTree(agent.resume(project, proposed.path("run_id").asText()));
    assertFalse(stale.has("candidate"));
    assertTrue(stale.path("recovery_note").asText().contains("版本"));
    verify(provider, never()).complete(any(), any(), anyInt(), any());
    assertThrows(
        dev.labflow.api.ApiException.class,
        () -> agent.resume(project + 999999, proposed.path("run_id").asText()));
  }

  @Test
  void activeSessionRejectsParallelNewRoundsEvenWithoutAParentProposal() throws Exception {
    CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              entered.countDown();
              release.await(5, TimeUnit.SECONDS);
              return reply(null, "reply");
            });
    var first = start();
    try {
      assertTrue(entered.await(2, TimeUnit.SECONDS));
      request.put("session_id", first.path("session_id").asText());
      assertEquals(409, assertThrows(dev.labflow.api.ApiException.class, () -> start()).status);
      var recovery = json.valueToTree(agent.resume(project, first.path("run_id").asText()));
      assertEquals(first.path("run_id"), recovery.at("/run/run_id"));
      assertTrue(recovery.has("baseline"));
      verify(provider, times(1)).complete(any(), any(), anyInt(), any());
    } finally {
      agent.cancel(project, first.path("run_id").asText());
      release.countDown();
    }
  }

  @Test
  void disabledTestCleanupIsReally404AndWrongMethodsAre405RatherThanInternalErrors()
      throws Exception {
    mvc.perform(delete("/api/test/projects?after=1").header("X-LabFlow-Test-Run", "1"))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/test/projects?after=1")).andExpect(status().isNotFound());
    mvc.perform(delete("/api/agent/provider")).andExpect(status().isMethodNotAllowed());
    assertEquals(1, workspace.versions(project, chart).size());
    verify(provider, never()).complete(any(), any(), anyInt(), any());
  }

  @Test
  void proposalIsValidatedAndNeverWritesChartsDataOrVersions() throws Exception {
    var bytes = (byte[]) workspace.original(project, dataset).get("original_file");
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenReturn(
            reply("[" + call("c1", "set_style", "{\"fontSize\":18}") + "]", ""),
            reply(null, "请确认字号调整"));
    String body =
        mvc.perform(
                post("/api/projects/" + project + "/agent/runs")
                    .contentType("application/json")
                    .content(request.toString()))
            .andExpect(status().isAccepted())
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode result = await(json.readTree(body).path("run_id").asText());
    assertEquals("proposed", result.path("status").asText());
    assertEquals(18, result.at("/proposal/config/style/fontSize").asInt());
    assertEquals(dataset, result.at("/proposal/source/dataset_version_id").asLong());
    assertEquals(64, result.path("catalog_hash").asText().length());
    assertEquals(1, workspace.chart(project, chart).get("revision"));
    assertEquals(1, workspace.versions(project, chart).size());
    assertArrayEquals(bytes, (byte[]) workspace.original(project, dataset).get("original_file"));
    mvc.perform(
            get(
                "/api/projects/"
                    + (project + 999999)
                    + "/agent/runs/"
                    + result.path("run_id").asText()))
        .andExpect(status().isNotFound());
  }

  @Test
  void finalBatchIsValidatedOnceEvenIfItsIntermediateAxisRangeIsInvalid() throws Exception {
    ((ObjectNode) request.at("/config/axes/y")).put("min", "0").put("max", "1");
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenReturn(
            reply(
                "["
                    + call("min", "set_axis", "{\"axis\":\"y\",\"min\":2}")
                    + ","
                    + call("max", "set_axis", "{\"axis\":\"y\",\"max\":4}")
                    + "]",
                ""),
            reply(null, "轴范围改为2到4"));
    var result = await(start().path("run_id").asText());
    assertEquals("proposed", result.path("status").asText());
    assertEquals("2", result.at("/proposal/config/axes/y/min").asText());
    assertEquals("4", result.at("/proposal/config/axes/y/max").asText());
  }

  @Test
  void invalidMixedBatchIsRolledBackAndErrorIsFedBackForRepair() throws Exception {
    var count = new AtomicInteger();
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              int n = count.getAndIncrement();
              if (n == 0)
                return reply(
                    "["
                        + call("a", "set_style", "{\"fontSize\":21}")
                        + ","
                        + call("b", "map_series", "{\"seriesId\":\"s1\",\"y\":\"invented\"}")
                        + "]",
                    "");
              if (n == 1) {
                String history = inv.getArgument(0).toString();
                assertTrue(history.contains("本轮候选批次全部撤回"));
                return reply("[" + call("c", "set_legend", "{\"position\":\"right\"}") + "]", "");
              }
              return reply(null, "仅调整图例");
            });
    request.put("max_tokens", 60000);
    var result = await(start().path("run_id").asText());
    assertEquals("proposed", result.path("status").asText());
    assertEquals(14, result.at("/proposal/config/style/fontSize").asInt());
    assertEquals("right", result.at("/proposal/config/legend/position").asText());
    assertEquals(1, result.at("/proposal/operations").size());
    assertEquals("accuracy", result.at("/proposal/config/series/0/y").asText());
  }

  @Test
  void readToolsAreScopedAndDoNotSendRawRowsOrSamples() throws Exception {
    var n = new AtomicInteger();
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              if (n.getAndIncrement() == 0)
                return reply(
                    "["
                        + call("p", "get_dataset_profile", "{}")
                        + ","
                        + call("s", "get_figure_spec", "{\"type\":\"line\"}")
                        + ","
                        + call("l", "lint_figure", "{}")
                        + "]",
                    "");
              String history = inv.getArgument(0).toString();
              assertFalse(history.contains("\\\"head\\\""));
              assertFalse(history.contains("\\\"samples\\\""));
              assertTrue(history.contains("dataset_version_id"));
              return reply(null, "请选择需要调整的属性");
            });
    assertEquals("answered", await(start().path("run_id").asText()).path("status").asText());
  }

  @Test
  void tokenAndStepBudgetsNeverProducePartialProposals() throws Exception {
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenReturn(reply("[" + call("one", "set_style", "{\"fontSize\":18}") + "]", ""));
    request.put("max_steps", 1);
    var result = await(start().path("run_id").asText());
    assertEquals("incomplete", result.path("status").asText());
    assertFalse(result.has("proposal"));
    reset(provider);
    when(provider.info()).thenReturn(new ModelProvider.Info(true, "fixture", "local", ""));
    request.put("max_tokens", 2000);
    result = await(start().path("run_id").asText());
    assertEquals("incomplete", result.path("status").asText());
    // A notice is still traced when there is not enough input budget to call the provider.
    assertTrue(result.toString().contains("budget_notice"), result.toString());
    verify(provider, never()).complete(any(), any(), anyInt(), any());
  }

  private int inputCost(JsonNode messages, JsonNode tools) {
    return messages.toString().getBytes(StandardCharsets.UTF_8).length
        + 64
        + tools.toString().getBytes(StandardCharsets.UTF_8).length
        + 64
        + 256;
  }

  @Test
  void runFreezesTheSelectedProviderInsteadOfSwitchingConnectionsBetweenRounds() throws Exception {
    var selected = mock(ModelProvider.class);
    when(selected.info())
        .thenReturn(new ModelProvider.Info(true, "frozen-model", "http://127.0.0.1", ""));
    when(selected.complete(any(), any(), anyInt(), any()))
        .thenReturn(
            reply("[" + call("frozen", "set_style", "{\"fontSize\":18}") + "]", ""),
            reply(null, "请确认候选"));
    when(provider.snapshot()).thenReturn(selected);
    var result = await(start().path("run_id").asText());
    assertEquals("proposed", result.path("status").asText());
    verify(selected, times(2)).complete(any(), any(), anyInt(), any());
    verify(provider, never()).complete(any(), any(), anyInt(), any());
  }

  @Test
  void budgetNoticeIsIncludedInPreflightAndCannotOverallocateTheRequest() throws Exception {
    var base = new AtomicInteger();
    doAnswer(
            inv -> {
              base.set(inputCost(inv.getArgument(0), inv.getArgument(1)));
              return reply(null, "ok");
            })
        .when(provider)
        .complete(any(), any(), anyInt(), any());
    request.put("max_tokens", 60000);
    await(start().path("run_id").asText());
    clearInvocations(provider);
    request.put("max_tokens", base.get() + 128);
    var result = await(start().path("run_id").asText());
    assertEquals("incomplete", result.path("status").asText());
    assertFalse(result.has("proposal"));
    verify(provider, never()).complete(any(), any(), anyInt(), any());
  }

  @Test
  void validatedCandidateUsesAnAffordableTextOnlyClosingRound() throws Exception {
    var n = new AtomicInteger();
    var charged = new java.util.concurrent.atomic.AtomicLong();
    request.put("max_tokens", 20000);
    doAnswer(
            inv -> {
              JsonNode messages = inv.getArgument(0), tools = inv.getArgument(1);
              int cost = inputCost(messages, tools);
              assertTrue(charged.get() + cost + (int) inv.getArgument(2) <= 20000);
              ModelProvider.Reply response;
              if (n.getAndIncrement() == 0) {
                assertFalse(tools.isEmpty());
                response = reply("[" + call("edit", "set_style", "{\"fontSize\":18}") + "]", "");
              } else {
                assertTrue(tools.isEmpty(), "Closing round exposes no mutation tools");
                assertTrue(messages.toString().contains("必要的澄清仍需提出"));
                response = reply(null, "字号18的候选已校验，请确认后应用。");
              }
              charged.addAndGet(
                  cost
                      + response.message().toString().getBytes(StandardCharsets.UTF_8).length
                      + 64);
              return response;
            })
        .when(provider)
        .complete(any(), any(), anyInt(), any());
    var result = await(start().path("run_id").asText());
    assertEquals("proposed", result.path("status").asText());
    assertEquals(2, result.path("steps").asInt());
    assertEquals(18, result.at("/proposal/config/style/fontSize").asInt());
    assertEquals(1, result.at("/proposal/operations").size());
    assertTrue(result.path("budget_used").asLong() <= 20000);
    assertEquals(1, workspace.versions(project, chart).size());
  }

  @Test
  void budgetGuidancePreservesClarificationAndRejectsUnexpectedClosingTools() throws Exception {
    request.put("max_tokens", 20000).put("prompt", "把范围改为0到1");
    doAnswer(
            inv -> {
              String messages = inv.getArgument(0).toString();
              assertTrue(messages.contains("信息不足仍应追问"));
              assertFalse(messages.contains("不要再追问"));
              return reply(null, "请问要调整 X 轴还是 Y 轴？");
            })
        .when(provider)
        .complete(any(), any(), anyInt(), any());
    var result = await(start().path("run_id").asText());
    assertEquals("answered", result.path("status").asText());
    assertFalse(result.has("proposal"));
    doReturn(reply("[" + call("edit", "set_style", "{\"fontSize\":18}") + "]", ""))
        .when(provider)
        .complete(any(), any(), anyInt(), any());
    result = await(start().path("run_id").asText());
    assertEquals("incomplete", result.path("status").asText());
    assertFalse(result.has("proposal"));
    assertEquals(1, workspace.versions(project, chart).size());
  }

  @Test
  void queueIsBoundedAndCancellingQueuedRunsReleasesCapacity() throws Exception {
    CountDownLatch entered = new CountDownLatch(2);
    CountDownLatch blocked = new CountDownLatch(1);
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              entered.countDown();
              blocked.await(10, TimeUnit.SECONDS);
              return reply(null, "完成");
            });
    var ids = new java.util.ArrayList<String>();
    for (int i = 0; i < 6; i++) ids.add(start().path("run_id").asText());
    assertTrue(entered.await(3, TimeUnit.SECONDS));
    var error = assertThrows(dev.labflow.api.ApiException.class, this::start);
    assertEquals(429, error.status);
    ids.forEach(id -> agent.cancel(project, id));
    blocked.countDown();
    for (var id : ids) assertEquals("cancelled", await(id).path("status").asText());
    when(provider.complete(any(), any(), anyInt(), any())).thenReturn(reply(null, "新的运行正常"));
    assertEquals("answered", await(start().path("run_id").asText()).path("status").asText());
  }

  @Test
  void truncatedModelOutputCannotBecomeAnApplicableProposal() throws Exception {
    var message = json.createObjectNode().put("role", "assistant").put("content", "incomplete");
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenReturn(new ModelProvider.Reply(message, 20, 20, "fixture", "length"));
    var result = await(start().path("run_id").asText());
    assertEquals("incomplete", result.path("status").asText());
    assertFalse(result.has("proposal"));
  }

  @Test
  void cancelAndTimeoutDiscardLateResultsAndInterruptProvider() throws Exception {
    CountDownLatch entered = new CountDownLatch(1), interrupted = new CountDownLatch(1);
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              entered.countDown();
              try {
                Thread.sleep(10000);
              } catch (InterruptedException e) {
                interrupted.countDown();
                throw e;
              }
              return reply(null, "late");
            });
    String id = start().path("run_id").asText();
    assertTrue(entered.await(3, TimeUnit.SECONDS));
    agent.cancel(project, id);
    assertTrue(interrupted.await(3, TimeUnit.SECONDS));
    assertEquals("cancelled", await(id).path("status").asText());
    request.put("timeout_seconds", 1);
    id = start().path("run_id").asText();
    assertEquals("incomplete", await(id).path("status").asText());
    assertFalse(json.valueToTree(agent.get(project, id)).has("proposal"));
  }

  @Test
  void staleRevisionMissingConsentAndExtraFieldsAreRejectedBeforeModelCall() throws Exception {
    request.put("share_metadata", false);
    mvc.perform(
            post("/api/projects/" + project + "/agent/runs")
                .contentType("application/json")
                .content(request.toString()))
        .andExpect(status().isBadRequest());
    request.put("share_metadata", true).put("operations", "untrusted");
    assertThrows(dev.labflow.api.ApiException.class, () -> agent.start(project, request));
    request.remove("operations");
    workspace.saveChart(project, chart, "External edit", 1, request.path("config"));
    mvc.perform(
            post("/api/projects/" + project + "/agent/runs")
                .contentType("application/json")
                .content(request.toString()))
        .andExpect(status().isConflict());
    verify(provider, never()).complete(any(), any(), anyInt(), any());
  }

  @Test
  void inventedToolAndConfigInjectionCannotReplaceTrustedSnapshot() throws Exception {
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenReturn(
            reply(
                "["
                    + call("hack", "lint_figure", "{\"config\":{\"datasetVersionId\":999}}")
                    + ","
                    + call("hack2", "save_chart", "{}")
                    + "]",
                ""),
            reply(null, "不能执行该请求"));
    var result = await(start().path("run_id").asText());
    assertEquals("answered", result.path("status").asText());
    assertFalse(result.has("proposal"));
    assertEquals(1, workspace.versions(project, chart).size());
  }
}
