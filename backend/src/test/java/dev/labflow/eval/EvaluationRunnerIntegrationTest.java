package dev.labflow.eval;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.sun.net.httpserver.HttpServer;
import dev.labflow.LabFlowApplication;
import dev.labflow.TestDatasourceInitializer;
import dev.labflow.agent.*;
import dev.labflow.service.*;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(
    classes = LabFlowApplication.class,
    properties = {
      "LABFLOW_AGENT_BASE_URL=http://127.0.0.1:1",
      "LABFLOW_AGENT_MODEL=",
      "labflow.test-support=false"
    })
@ContextConfiguration(initializers = TestDatasourceInitializer.class)
class EvaluationRunnerIntegrationTest {
  @Autowired ObjectMapper json;
  @Autowired WorkspaceService workspace;
  @Autowired FigureToolService figures;
  @Autowired AgentAuditService audit;
  @Autowired JdbcTemplate db;
  @Autowired PlatformTransactionManager transactions;
  @TempDir Path directory;
  JsonNode suite;
  EvaluationRunner runner;
  int projects, runs;

  @BeforeAll
  static void evaluationRunsOnlyOnRealMysql() {
    Assumptions.assumeTrue(
        TestDatasourceInitializer.isMysql(),
        "评测依赖真实 MySQL（LABFLOW_TEST_DB=" + TestDatasourceInitializer.TEST_DB + "），H2 跳过（任务 14-1-4.3）");
  }

  @BeforeEach
  void setup() throws Exception {
    try (var stream = getClass().getResourceAsStream("/agent-eval/suite-v1.json")) {
      suite = json.readTree(stream);
    }
    runner =
        new EvaluationRunner(
            json, workspace, figures, audit, db, new TransactionTemplate(transactions));
    projects = db.queryForObject("SELECT COUNT(*) FROM projects", Integer.class);
    runs = db.queryForObject("SELECT COUNT(*) FROM agent_runs", Integer.class);
  }

  @AfterEach
  void fixturesLeaveNoRowsBehind() {
    assertEquals(projects, db.queryForObject("SELECT COUNT(*) FROM projects", Integer.class));
    assertEquals(runs, db.queryForObject("SELECT COUNT(*) FROM agent_runs", Integer.class));
  }

  @Test
  void liveTransportUsesSameAssertionsAndNeverReceivesAnswersOrRubrics() throws Exception {
    var selected = Set.of("N01", "R01", "C03");
    var baseline = runner.run(suite, "replay", selected, null, directory.resolve("baseline"), null);
    var requests = new CopyOnWriteArrayList<JsonNode>();
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/chat/completions",
        exchange -> {
          var request = json.readTree(exchange.getRequestBody());
          requests.add(request);
          String prompt = request.path("messages").get(1).path("content").asText();
          JsonNode item = null;
          for (var candidate : suite.path("cases"))
            if (candidate.path("prompt").asText().equals(prompt)) item = candidate;
          if (item == null) {
            exchange.sendResponseHeaders(400, -1);
            exchange.close();
            return;
          }
          boolean followup = request.path("messages").size() > 2;
          var turn = item.path("recording").get(followup ? item.path("recording").size() - 1 : 0);
          var response = json.createObjectNode().put("model", "synthetic-http-provider");
          response
              .putArray("choices")
              .addObject()
              .put("finish_reason", turn.path("finish_reason").asText())
              .set("message", turn.path("message"));
          response.putObject("usage").put("prompt_tokens", 40).put("completion_tokens", 20);
          var bytes = json.writeValueAsBytes(response);
          exchange.getResponseHeaders().set("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    server.start();
    ObjectNode report;
    try {
      var provider =
          new CompatibleModelProvider(
              json,
              "http://127.0.0.1:" + server.getAddress().getPort(),
              "synthetic-http-provider",
              "");
      report =
          runner.run(suite, "live", selected, provider, directory.resolve("local-http"), baseline);
    } finally {
      server.stop(0);
    }
    assertEquals(0, report.at("/summary/failed").asInt());
    assertEquals("PASS", report.at("/cases/0/verdict").asText());
    assertEquals("REVIEW", report.at("/cases/1/verdict").asText());
    assertEquals("REVIEW", report.at("/cases/2/verdict").asText());
    assertEquals(4, requests.size());
    for (var request : requests) {
      assertFalse(request.toString().contains("review_rubric"));
      assertFalse(request.toString().contains("reply_pattern"));
      assertFalse(request.toString().contains("allowed_changes"));
      if (request.path("messages").size() == 2)
        assertFalse(
            request.toString().contains("fixture_"),
            "Initial request must not contain authored outputs");
    }
    assertEquals(3, report.path("comparison").size());
    assertFalse(report.at("/comparison/0/token_metrics_comparable").asBoolean());
    assertTrue(report.at("/comparison/0/model_changed").asBoolean());
    assertTrue(Files.readString(directory.resolve("local-http.md")).contains("REVIEW"));
  }

  @Test
  void badRecordingFailsThroughRealHarnessRatherThanJustComparingFixtureToItself()
      throws Exception {
    var bad = suite.deepCopy();
    ((ObjectNode) bad.at("/cases/0/recording/0/message/tool_calls/0/function"))
        .put("arguments", "{\"fontSize\":90}");
    var report = runner.run(bad, "replay", Set.of("N01"), null, directory.resolve("bad"), null);
    assertEquals(1, report.at("/summary/failed").asInt());
    assertFalse(report.at("/cases/0/checks/no_invalid_tool_attempts").asBoolean());
    assertEquals("answered", report.at("/cases/0/status").asText());
    assertTrue(Files.readString(directory.resolve("bad.md")).contains("FAIL"));
  }

  @Test
  void invalidModeMissingProviderUnknownCasesAndForeignBaselineNeverStartRuns() {
    assertThrows(
        IllegalArgumentException.class,
        () -> runner.run(suite, "automatic", Set.of(), null, directory.resolve("invalid"), null));
    assertThrows(
        IllegalArgumentException.class,
        () -> runner.run(suite, "live", Set.of(), null, directory.resolve("invalid"), null));
    assertThrows(
        IllegalArgumentException.class,
        () -> runner.run(suite, "replay", Set.of("N99"), null, directory.resolve("invalid"), null));
    var baseline = json.createObjectNode().put("report_version", 1).put("suite_hash", "wrong");
    assertThrows(
        IllegalArgumentException.class,
        () -> runner.run(suite, "replay", Set.of(), null, directory.resolve("invalid"), baseline));
    assertFalse(Files.exists(directory.resolve("invalid.json")));
  }

  @Test
  void oversizedUsageIsStoppedByHarnessAndCannotAppearAsASuccessfulProposal() throws Exception {
    var bad = suite.deepCopy();
    ((ObjectNode) bad.at("/cases/0/recording/0")).put("prompt_tokens", 60001);
    var report = runner.run(bad, "replay", Set.of("N01"), null, directory.resolve("budget"), null);
    assertEquals(1, report.at("/summary/failed").asInt());
    assertEquals("incomplete", report.at("/cases/0/status").asText());
    assertEquals("token_budget", report.at("/cases/0/reason_code").asText());
    assertFalse(report.at("/cases/0/checks/token_limit").asBoolean());
    assertEquals(1, report.at("/summary/harness_stopped_count").asInt());
  }

  @Test
  void insufficientSpendReservationSkipsBeforeCreatingFixturesOrCallingProvider() throws Exception {
    String previous = System.getProperty("labflow.eval.maxCostCny");
    try {
      System.setProperty("labflow.eval.maxCostCny", "0.000001");
      var provider = org.mockito.Mockito.mock(ModelProvider.class);
      org.mockito.Mockito.when(provider.info())
          .thenReturn(new ModelProvider.Info(true, "fixture", "local", ""));
      var report =
          runner.run(
              suite,
              "live",
              Set.of("N01", "R01"),
              provider,
              directory.resolve("preflight-budget"),
              null);
      assertEquals("budget_limited", report.path("completion").asText());
      assertEquals(2, report.path("skipped_by_budget").size());
      assertEquals(0, report.at("/summary/total").asInt());
      assertEquals(0, report.at("/cost/spent_tokens").asLong());
      org.mockito.Mockito.verify(provider, org.mockito.Mockito.never())
          .complete(
              org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
              org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.any());
    } finally {
      if (previous == null) System.clearProperty("labflow.eval.maxCostCny");
      else System.setProperty("labflow.eval.maxCostCny", previous);
    }
  }
}
