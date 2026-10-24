package dev.labflow.eval;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import dev.labflow.LabFlowApplication;
import dev.labflow.TestDatasourceInitializer;
import dev.labflow.agent.*;
import dev.labflow.service.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(
    classes = LabFlowApplication.class,
    properties = {
      // Context construction can never activate an external provider; live uses an explicit
      // instance.
      "LABFLOW_AGENT_BASE_URL=http://127.0.0.1:1",
      "LABFLOW_AGENT_MODEL=",
      "labflow.test-support=false"
    })
@ContextConfiguration(initializers = TestDatasourceInitializer.class)
class AgentEvaluationTest {
  @Autowired ObjectMapper json;
  @Autowired WorkspaceService workspace;
  @Autowired FigureToolService figures;
  @Autowired AgentAuditService audit;
  @Autowired JdbcTemplate db;
  @Autowired PlatformTransactionManager transactions;

  @BeforeAll
  static void evaluationRunsOnlyOnRealMysql() {
    Assumptions.assumeTrue(
        TestDatasourceInitializer.isMysql(),
        "评测依赖真实 MySQL（LABFLOW_TEST_DB=" + TestDatasourceInitializer.TEST_DB + "），H2 跳过（任务 14-1-4.3）");
  }

  @Test
  void runThirtyCasesOfflineUnlessLiveIsExplicitlyEnabled() throws Exception {
    String mode = System.getProperty("labflow.eval.mode", "replay");
    ModelProvider live = null;
    if (mode.equals("live")) {
      assertEquals(
          "true",
          System.getProperty("labflow.eval.live"),
          "Live mode requires -Dlabflow.eval.live=true; it may incur API charges");
      try {
        live =
            new CompatibleModelProvider(
                json,
                System.getenv().getOrDefault("LABFLOW_AGENT_BASE_URL", "https://api.deepseek.com"),
                System.getenv().getOrDefault("LABFLOW_AGENT_MODEL", ""),
                System.getenv().getOrDefault("LABFLOW_AGENT_API_KEY", ""));
      } catch (RuntimeException invalidConfiguration) {
        // URI parser exceptions can include a malformed URL containing credentials.
        throw new IllegalArgumentException(
            "Invalid model configuration; credentials belong only in the API key environment"
                + " variable");
      }
    }
    JsonNode suite;
    try (var stream = getClass().getResourceAsStream("/agent-eval/suite-v1.json")) {
      suite = json.readTree(stream);
    }
    String selection = System.getProperty("labflow.eval.cases", "");
    Set<String> selected = new LinkedHashSet<>();
    if (!selection.isBlank())
      for (String id : selection.split(",", -1)) {
        if (id.isBlank()) throw new IllegalArgumentException("Empty case id");
        selected.add(id.trim());
      }
    var output = Path.of(System.getProperty("labflow.eval.output", "target/agent-eval/" + mode));
    String previous = System.getProperty("labflow.eval.baseline", "");
    JsonNode baseline = null;
    if (!previous.isBlank()) {
      var path = Path.of(previous);
      if (Files.size(path) > 2_000_000)
        throw new IllegalArgumentException("Baseline report too large");
      baseline = json.readTree(path.toFile());
    }
    int projects = db.queryForObject("SELECT COUNT(*) FROM projects", Integer.class);
    int runs = db.queryForObject("SELECT COUNT(*) FROM agent_runs", Integer.class);
    var runner =
        new EvaluationRunner(
            json, workspace, figures, audit, db, new TransactionTemplate(transactions));
    var report = runner.run(suite, mode, selected, live, output, baseline);
    assertEquals(
        projects,
        db.queryForObject("SELECT COUNT(*) FROM projects", Integer.class),
        "Exact-id evaluation fixture cleanup");
    assertEquals(
        runs,
        db.queryForObject("SELECT COUNT(*) FROM agent_runs", Integer.class),
        "Temporary audits removed with owned projects");
    assertEquals(
        selected.isEmpty() ? 30 : selected.size(),
        report.at("/summary/total").asInt() + report.path("skipped_by_budget").size());
    assertEquals(
        0,
        report.at("/summary/failed").asInt(),
        "Failed cases are in " + output.toAbsolutePath() + ".md");
    if (mode.equals("replay") && selected.isEmpty()) {
      assertEquals(12, report.at("/summary/proposed_count").asInt());
      assertEquals(18, report.at("/summary/answered_count").asInt());
      assertEquals(18, report.at("/summary/semantic_review_cases").asInt());
    }
  }
}
