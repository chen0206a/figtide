package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.*;
import dev.labflow.repository.*;
import dev.labflow.service.WorkspaceService;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties =
        "spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_test?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC")
@AutoConfigureMockMvc
class AgentAuditIntegrationTest {
  @Autowired AgentRunService agent;
  @Autowired AgentAuditService audit;
  @Autowired WorkspaceService workspace;
  @Autowired WorkspaceRepository workspaceDb;
  @Autowired ObjectMapper json;
  @Autowired MockMvc mvc;
  @MockitoBean ModelProvider provider;
  @MockitoSpyBean AgentAuditRepository db;
  long project, chart, dataset;
  ObjectNode request;

  @BeforeEach
  void setup() throws Exception {
    when(provider.info())
        .thenReturn(new ModelProvider.Info(true, "audit-fixture", "http://127.0.0.1", ""));
    project =
        json.valueToTree(workspace.createProject("Audit integration", "synthetic test"))
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
    var c = (ObjectNode) json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    c.put("datasetVersionId", dataset);
    chart =
        json.valueToTree(workspace.saveChart(project, null, "Before", null, c)).path("id").asLong();
    request =
        json.createObjectNode()
            .put("protocol_version", 1)
            .put("chart_id", chart)
            .put("base_revision", 1)
            .put("prompt", "sensitive research prompt")
            .put("share_metadata", true);
    request.set("config", c);
    var call = json.createObjectNode().put("id", "call-sensitive-id").put("type", "function");
    call.putObject("function")
        .put("name", "set_style")
        .put("arguments", "{\"fontSize\":18,\"title\":\"private title sk-secret123\"}");
    var message = json.createObjectNode().put("role", "assistant").put("content", "");
    message.putArray("tool_calls").add(call);
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenReturn(
            new ModelProvider.Reply(message, 40, 20, "actual-model", "tool_calls"),
            new ModelProvider.Reply(
                json.createObjectNode()
                    .put("role", "assistant")
                    .put("content", "private model reply"),
                30,
                10,
                "actual-model",
                "stop"));
  }

  JsonNode await(String id) throws Exception {
    for (int i = 0; i < 300; i++) {
      JsonNode r = json.valueToTree(agent.get(project, id));
      if (!Set.of("queued", "running").contains(r.path("status").asText())) return r;
      Thread.sleep(20);
    }
    throw new AssertionError("Run did not terminate");
  }

  JsonNode run() throws Exception {
    return await(json.valueToTree(agent.start(project, request)).path("run_id").asText());
  }

  ObjectNode decision(JsonNode r, String outcome) {
    return json.createObjectNode()
        .put("outcome", outcome)
        .put("proposal_hash", r.path("proposal_hash").asText());
  }

  @Test
  void terminalTraceHasCallsResultsVersionsAndUsageButNeverFreeTextOrRawConfig() throws Exception {
    JsonNode live = run();
    String id = live.path("run_id").asText();
    var saved = audit.detail(project, id);
    assertTrue(live.path("persisted").asBoolean());
    assertEquals("pending", saved.path("outcome").asText());
    assertEquals("actual-model", saved.path("model").asText());
    assertEquals(70, saved.path("prompt_tokens").asInt());
    assertEquals(30, saved.path("completion_tokens").asInt());
    assertEquals(100, saved.path("tokens").asInt());
    assertTrue(saved.path("usage_complete").asBoolean());
    assertEquals(64, saved.path("catalog_hash").asText().length());
    assertEquals(dataset, saved.path("dataset_version_id").asLong());
    assertEquals(chart, saved.path("chart_id").asLong());
    assertEquals(1, saved.path("base_revision").asInt());
    assertEquals(64, saved.path("proposal_hash").asText().length());
    var events = saved.path("trace");
    JsonNode call = null, result = null;
    for (var e : events) {
      if (e.path("event").asText().equals("tool_call")) call = e;
      if (e.path("event").asText().equals("tool")) result = e;
    }
    assertNotNull(call);
    assertNotNull(result);
    assertEquals(call.path("call_id"), result.path("call_id"));
    assertEquals(18, call.at("/arguments/fontSize").asInt());
    assertTrue(call.at("/arguments/title/redacted").asBoolean());
    assertTrue(result.path("result").path("ok").asBoolean());
    String row = db.find(project, id).toString();
    for (String secret :
        List.of(
            "sensitive research prompt",
            "private title",
            "sk-secret123",
            "private model reply",
            "call-sensitive-id")) assertFalse(row.contains(secret), secret);
    assertFalse(saved.path("proposal_summary").has("config"));
    assertFalse(saved.has("config"));
    assertEquals(1, workspace.versions(project, chart).size());
    mvc.perform(get("/api/projects/" + (project + 999999) + "/agent/runs/" + id + "/audit"))
        .andExpect(status().isNotFound());
  }

  @Test
  void decisionsAreBoundIdempotentAndImmutableAndNeverSaveAChart() throws Exception {
    var r = run();
    String id = r.path("run_id").asText();
    var accept = decision(r, "accepted");
    var first = json.valueToTree(agent.decide(project, id, accept));
    assertEquals("accepted", first.path("outcome").asText());
    assertFalse(first.path("decision_at").isNull());
    assertEquals(first, json.valueToTree(agent.decide(project, id, accept)));
    var conflict =
        assertThrows(
            dev.labflow.api.ApiException.class,
            () -> agent.decide(project, id, decision(r, "rejected")));
    assertEquals(409, conflict.status);
    assertEquals(1, workspace.chart(project, chart).get("revision"));
    assertFalse(json.valueToTree(agent.get(project, id)).has("proposal"));
    var forged = decision(r, "accepted").put("proposal_hash", "forged");
    assertEquals(
        409,
        assertThrows(dev.labflow.api.ApiException.class, () -> agent.decide(project, id, forged))
            .status);
    var extra = decision(r, "accepted").put("project_id", project);
    assertEquals(
        400,
        assertThrows(dev.labflow.api.ApiException.class, () -> agent.decide(project, id, extra))
            .status);
  }

  @Test
  void rejectionIsReadableScrubsCredentialsAndListsWithProjectChartAndPaging() throws Exception {
    var r = run();
    String id = r.path("run_id").asText();
    var result =
        json.valueToTree(
            agent.decide(
                project,
                id,
                decision(r, "rejected")
                    .put(
                        "reason", "图例不合适 api_key=private-key Bearer private-token sk-private123")));
    assertTrue(result.path("decision_reason").asText().contains("图例不合适"));
    for (String secret : List.of("private-key", "private-token", "sk-private123"))
      assertFalse(result.toString().contains(secret));
    String response =
        mvc.perform(
                get(
                    "/api/projects/"
                        + project
                        + "/agent/history?chart_id="
                        + chart
                        + "&outcome=rejected&page=0&size=1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].run_id").value(id))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertFalse(json.readTree(response).path("has_more").asBoolean());
    mvc.perform(get("/api/projects/" + project + "/agent/history?page=-1"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/projects/" + project + "/agent/history?outcome=anything"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/projects/" + project + "/agent/history?chart_id=" + (chart + 9999)))
        .andExpect(jsonPath("$.items.length()").value(0));
  }

  @Test
  void staleSavedRevisionPreventsAcceptanceButStillAllowsRejection() throws Exception {
    var r = run();
    String id = r.path("run_id").asText();
    workspace.saveChart(project, chart, "External edit", 1, request.path("config"));
    assertEquals(
        409,
        assertThrows(
                dev.labflow.api.ApiException.class,
                () -> agent.decide(project, id, decision(r, "accepted")))
            .status);
    assertEquals("pending", audit.detail(project, id).path("outcome").asText());
    assertEquals(
        "rejected",
        json.valueToTree(agent.decide(project, id, decision(r, "rejected")))
            .path("outcome")
            .asText());
  }

  @Test
  void storageFailureDisablesProposalUntilTheExactTerminalRecordIsRetried() throws Exception {
    AtomicBoolean unavailable = new AtomicBoolean(true);
    doAnswer(
            inv -> {
              if (unavailable.get()) throw new IllegalStateException("private-storage-error");
              return inv.callRealMethod();
            })
        .when(db)
        .finish(any(Object[].class));
    var r = run();
    String id = r.path("run_id").asText();
    assertTrue(r.path("audit_error").asBoolean());
    assertFalse(r.has("proposal"));
    assertFalse(r.path("persisted").asBoolean());
    assertEquals("queued", db.find(project, id).get("status"));
    unavailable.set(false);
    r = json.valueToTree(agent.get(project, id));
    assertTrue(r.path("persisted").asBoolean());
    assertTrue(r.has("proposal"));
    assertFalse(r.has("audit_error"));
    assertEquals(1, workspaceDb.query("SELECT run_id FROM agent_runs WHERE run_id=?", id).size());
  }

  @Test
  void initialAuditFailureNeverCallsAModel() throws Exception {
    doThrow(new IllegalStateException("private-storage-error"))
        .when(db)
        .create(any(Object[].class));
    var failure =
        assertThrows(dev.labflow.api.ApiException.class, () -> agent.start(project, request));
    assertEquals(503, failure.status);
    assertFalse(failure.getMessage().contains("private-storage-error"));
    verify(provider, never()).complete(any(), any(), anyInt(), any());
  }

  @Test
  void competingAcceptAndRejectCannotOverwriteEachOther() throws Exception {
    var r = run();
    String id = r.path("run_id").asText();
    var pool = Executors.newFixedThreadPool(2);
    var gate = new CountDownLatch(1);
    try {
      java.util.function.Function<String, Callable<String>> task =
          choice ->
              () -> {
                gate.await();
                try {
                  return json.valueToTree(agent.decide(project, id, decision(r, choice)))
                      .path("outcome")
                      .asText();
                } catch (dev.labflow.api.ApiException e) {
                  assertEquals(409, e.status);
                  return "conflict";
                }
              };
      var a = pool.submit(task.apply("accepted"));
      var b = pool.submit(task.apply("rejected"));
      gate.countDown();
      var outcomes = List.of(a.get(5, TimeUnit.SECONDS), b.get(5, TimeUnit.SECONDS));
      assertEquals(1, outcomes.stream().filter("conflict"::equals).count());
      assertTrue(outcomes.contains(audit.detail(project, id).path("outcome").asText()));
      assertEquals(1, workspace.versions(project, chart).size());
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void cancellationIsDurableAndLateModelResponsesCannotChangeIt() throws Exception {
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    var handedBack = new CountDownLatch(1);
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenAnswer(
            inv -> {
              entered.countDown();
              while (release.getCount() > 0) {
                try {
                  release.await();
                } catch (InterruptedException ignored) {
                }
              }
              handedBack.countDown();
              return new ModelProvider.Reply(
                  json.createObjectNode()
                      .put("role", "assistant")
                      .put("content", "late private text"),
                  999,
                  999,
                  "late-model",
                  "stop");
            });
    String id = json.valueToTree(agent.start(project, request)).path("run_id").asText();
    assertTrue(entered.await(3, TimeUnit.SECONDS));
    agent.cancel(project, id);
    var before = audit.detail(project, id);
    assertEquals("cancelled", before.path("outcome").asText());
    assertFalse(before.path("usage_complete").asBoolean());
    release.countDown();
    assertTrue(handedBack.await(3, TimeUnit.SECONDS));
    Thread.sleep(50);
    assertEquals(before, audit.detail(project, id));
    assertEquals(0, before.path("tokens").asInt());
    assertFalse(before.has("proposal_summary"));
  }

  @Test
  void failureAndExhaustedBudgetsPersistTruthfulOutcomesWithoutUpstreamSecrets() throws Exception {
    when(provider.complete(any(), any(), anyInt(), any()))
        .thenThrow(new IllegalStateException("sk-upstream-secret123"));
    var failed = run();
    var record = audit.detail(project, failed.path("run_id").asText());
    assertEquals("failed", record.path("outcome").asText());
    assertFalse(record.path("usage_complete").asBoolean());
    assertFalse(
        db.find(project, failed.path("run_id").asText())
            .toString()
            .contains("sk-upstream-secret123"));
    clearInvocations(provider);
    request.put("max_tokens", 2000);
    var limited = run();
    record = audit.detail(project, limited.path("run_id").asText());
    assertEquals("incomplete", record.path("outcome").asText());
    assertEquals("token_budget", record.path("reason_code").asText());
    assertTrue(record.path("usage_complete").asBoolean());
    assertEquals(0, record.path("tokens").asInt());
    verify(provider, never()).complete(any(), any(), anyInt(), any());
  }

  @Test
  void restartRecoveryPreservesCompletedRecordsAndMarksUnfinishedUsageUnknown() throws Exception {
    var completed = run();
    String id = completed.path("run_id").asText();
    var before = audit.detail(project, id);
    String interrupted = UUID.randomUUID().toString();
    var initial = (ObjectNode) completed.deepCopy();
    initial.put("run_id", interrupted);
    audit.begin(project, request, initial, provider.info(), completed.at("/proposal/source"));
    db.recover(UUID.randomUUID().toString());
    assertEquals(before, audit.detail(project, id));
    var recovered = json.valueToTree(agent.get(project, interrupted));
    assertEquals("interrupted", recovered.path("outcome").asText());
    assertFalse(recovered.path("usage_complete").asBoolean());
    assertFalse(recovered.has("proposal"));
    assertTrue(recovered.path("historical").asBoolean());
    var freshService = new AgentAuditService(db, json);
    assertEquals(before, freshService.detail(project, id));
    var readonly =
        new AgentRunService(
            provider,
            mock(dev.labflow.service.FigureToolService.class),
            workspace,
            json,
            freshService);
    try {
      assertEquals(
          409,
          assertThrows(
                  dev.labflow.api.ApiException.class,
                  () -> readonly.decide(project, id, decision(completed, "accepted")))
              .status);
      assertEquals(
          "rejected",
          json.valueToTree(readonly.decide(project, id, decision(completed, "rejected")))
              .path("outcome")
              .asText());
    } finally {
      readonly.close();
    }
  }
}
