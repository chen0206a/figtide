package dev.labflow.eval;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.AuditSanitizer;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;

/** Explicit opt-in live evaluation through the already configured server; never reads its key. */
@EnabledIfSystemProperty(named = "labflow.eval.server", matches = "true")
class ServerEvaluationTest {
  final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
  final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
  final String owner = "owned-live-evaluation:" + UUID.randomUUID();
  URI api;
  JdbcTemplate db;
  TransactionTemplate transaction;

  @Test
  void evaluateExistingConfiguredServer() throws Exception {
    api = URI.create(System.getProperty("labflow.eval.api", "http://127.0.0.1:8086/api"));
    assertTrue(
        api.getScheme().equals("http")
            && List.of("127.0.0.1", "localhost").contains(api.getHost())
            && api.getUserInfo() == null
            && api.getQuery() == null
            && api.getFragment() == null,
        "Only an explicit loopback LabFlow server is allowed");
    String jdbc =
        System.getProperty(
            "labflow.eval.jdbc", "jdbc:mysql://127.0.0.1:33316/labflow?serverTimezone=UTC");
    assertTrue(
        jdbc.matches(
            "jdbc:mysql://(127\\.0\\.0\\.1|localhost):33316/labflow(_test|_e2e)?(\\?.*)?"));
    var ds =
        new DriverManagerDataSource(
            jdbc,
            System.getenv().getOrDefault("LABFLOW_DB_USER", "labflow"),
            System.getenv().getOrDefault("LABFLOW_DB_PASSWORD", "labflow-local"));
    db = new JdbcTemplate(ds);
    transaction = new TransactionTemplate(new DataSourceTransactionManager(ds));
    JsonNode suite, initial;
    try (var stream = getClass().getResourceAsStream("/agent-eval/suite-v1.json")) {
      suite = json.readTree(stream);
    }
    try (var stream = getClass().getResourceAsStream("/config-v1.json")) {
      initial = json.readTree(stream);
    }
    EvaluationRunner.validateSuite(suite);
    var budget = EvaluationSpendBudget.configured();
    var selected =
        new HashSet<>(List.of(System.getProperty("labflow.eval.cases", "N01,R01,C03").split(",")));
    var known = new HashSet<String>();
    suite.path("cases").forEach(c -> known.add(c.path("id").asText()));
    assertTrue(
        !selected.isEmpty() && known.containsAll(selected), "Explicit valid case IDs required");
    var provider = request("GET", "/agent/provider", null);
    assertTrue(provider.path("available").asBoolean(), "Server has no configured model");
    var definition = json.createObjectNode();
    definition.set("suite", suite);
    definition.set("base_config", initial);
    var report =
        json.createObjectNode()
            .put("report_version", 1)
            .put("mode", "live-server")
            .put("suite_version", suite.path("suite_version").asText())
            .put("suite_hash", AuditSanitizer.hash(definition))
            .put("fixture_config_hash", AuditSanitizer.hash(initial))
            .put("protocol_version", 1)
            .put("config_schema_version", 1)
            .put("fixture_provenance", suite.path("fixture_provenance").asText())
            .put("token_usage_kind", "provider_reported")
            .put("started_at", Instant.now().toString())
            .put(
                "scope",
                "Actual model through loopback API; owned synthetic projects only. Refuse/clarify"
                    + " rules require semantic review.");
    var rows = report.putArray("cases");
    var skipped = report.putArray("skipped_by_budget");
    var allowed = new HashSet<String>();
    var catalog = request("GET", "/figure-tools/catalog", null);
    for (String key : List.of("tools", "read_tools"))
      catalog.path(key).forEach(t -> allowed.add(t.path("name").asText()));
    for (var item : suite.path("cases")) {
      if (!selected.contains(item.path("id").asText())) continue;
      if (!budget.canStartCase()) {
        skipped.add(item.path("id").asText());
        continue;
      }
      var row = runCase(item, suite, (ObjectNode) initial.deepCopy(), allowed);
      budget.record(row);
      rows.add(row);
      if (row.has("prompt_version")) report.set("prompt_version", row.path("prompt_version"));
      if (row.has("catalog_hash")) report.set("catalog_hash", row.path("catalog_hash"));
      System.out.printf(
          "LIVE %s %s steps=%d tokens=%d reason=%s%n",
          row.path("id").asText(),
          row.path("verdict").asText(),
          row.path("steps").asInt(),
          row.path("tokens").asLong(),
          row.path("reason_code").asText());
    }
    report.set("summary", EvaluationRunner.summarize(json, rows));
    report.put("completion", skipped.isEmpty() ? "complete" : "budget_limited");
    report.set("cost", budget.report(json, skipped.size()));
    report.put("finished_at", Instant.now().toString());
    var output =
        Path.of(System.getProperty("labflow.eval.output", "target/agent-eval/live-server"))
            .toAbsolutePath();
    Files.createDirectories(output.getParent());
    Files.writeString(
        Path.of(output + ".json"),
        json.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    Files.writeString(Path.of(output + ".md"), EvaluationRunner.markdown(report));
    assertEquals(0, report.at("/summary/failed").asInt(), "See live report " + output);
  }

  private ObjectNode runCase(JsonNode item, JsonNode suite, ObjectNode config, Set<String> allowed)
      throws Exception {
    long project = 0;
    String run = null;
    var row =
        json.createObjectNode()
            .put("id", item.path("id").asText())
            .put("category", item.path("category").asText())
            .put("prompt", item.path("prompt").asText())
            .put("review_rubric", item.path("review_rubric").asText());
    try {
      project =
          request(
                  "POST",
                  "/projects",
                  json.createObjectNode()
                      .put("name", "Live synthetic " + item.path("id").asText())
                      .put("description", owner))
              .path("id")
              .asLong();
      // Prove that this JDBC connection sees exactly the project created by this API invocation.
      assertEquals(
          owner,
          db.queryForObject("SELECT description FROM projects WHERE id=?", String.class, project));
      var dataset = upload(project, suite.path("csv").asText());
      for (var entry : item.path("setup").properties())
        EvaluationRunner.set(config, entry.getKey(), entry.getValue());
      config.put("datasetVersionId", dataset.path("id").asLong());
      var chartInput = json.createObjectNode().put("name", "Live synthetic fixture");
      chartInput.set("config", config);
      long chart =
          request("POST", "/projects/" + project + "/charts", chartInput).path("id").asLong();
      String before = EvaluationRunner.fingerprint(json, db, project);
      var input =
          json.createObjectNode()
              .put("protocol_version", 1)
              .put("chart_id", chart)
              .put("base_revision", 1)
              .put("share_metadata", true)
              .put("prompt", item.path("prompt").asText())
              .put("max_steps", 6)
              .put("max_tokens", 60000)
              .put("timeout_seconds", 30);
      input.set("config", config);
      String path = "/projects/" + project + "/agent/runs";
      run = request("POST", path, input).path("run_id").asText();
      JsonNode result = null;
      long deadline = System.nanoTime() + Duration.ofSeconds(35).toNanos();
      do {
        result = request("GET", path + "/" + run, null);
        if (!Set.of("queued", "running").contains(result.path("status").asText())) break;
        Thread.sleep(250);
      } while (System.nanoTime() < deadline);
      if (Set.of("queued", "running").contains(result.path("status").asText()))
        result = request("POST", path + "/" + run + "/cancel", json.createObjectNode());
      var audit = request("GET", path + "/" + run + "/audit", null);
      row.put("usage_complete", audit.path("usage_complete").asBoolean());
      row.set("tokens", result.path("tokens"));
      var lintInput =
          json.createObjectNode()
              .put("protocol_version", 1)
              .put("chart_id", chart)
              .put("base_revision", 1);
      lintInput.set("config", result.at("/proposal/config"));
      boolean lint =
          result.has("proposal")
              && request("POST", "/projects/" + project + "/figure-tools/lint", lintInput)
                  .path("ok")
                  .asBoolean();
      var source =
          request("GET", "/projects/" + project + "/data/" + dataset.path("id").asLong(), null);
      boolean bound =
          result.at("/proposal/config/datasetVersionId").equals(dataset.path("id"))
              && result.at("/proposal/source/dataset_version_id").asLong()
                  == dataset.path("id").asLong()
              && result.at("/proposal/source/sha256").equals(source.path("sha256"));
      row.setAll(
          EvaluationJudge.judge(
              item,
              result,
              config,
              allowed,
              before.equals(EvaluationRunner.fingerprint(json, db, project)),
              lint,
              bound,
              audit.path("status").equals(result.path("status"))
                  && audit.path("usage_complete").asBoolean()));
      row.put(
          "verdict",
          !row.path("mechanical_pass").asBoolean()
              ? "FAIL"
              : !row.path("efficiency_pass").asBoolean()
                  ? "SLOW"
                  : row.path("semantic_review_required").asBoolean() ? "REVIEW" : "PASS");
      for (String key :
          List.of(
              "run_id",
              "status",
              "steps",
              "tokens",
              "budget_used",
              "max_tokens",
              "max_steps",
              "latency_ms",
              "catalog_hash",
              "prompt_version")) row.set(key, result.path(key));
      row.put("model", AuditSanitizer.note(result.path("model").asText()))
          .put("final_text", AuditSanitizer.note(result.path("text").asText()));
      for (String key : List.of("reason_code", "trace", "proposal_summary"))
        row.set(key, audit.path(key));
    } catch (Exception error) {
      row.put("verdict", "FAIL")
          .put("mechanical_pass", false)
          .put("infrastructure_error", error.getClass().getSimpleName());
    } finally {
      if (project != 0) {
        assertEquals(
            owner,
            db.queryForObject("SELECT description FROM projects WHERE id=?", String.class, project),
            "Never clean up a foreign project");
        if (run != null)
          request(
              "POST",
              "/projects/" + project + "/agent/runs/" + run + "/cancel",
              json.createObjectNode());
        EvaluationRunner.cleanup(db, transaction, project);
        assertEquals(
            0,
            db.queryForObject("SELECT COUNT(*) FROM projects WHERE id=?", Integer.class, project));
      }
    }
    return row;
  }

  private JsonNode request(String method, String path, JsonNode body) throws Exception {
    var builder = HttpRequest.newBuilder(URI.create(api + path)).timeout(Duration.ofSeconds(8));
    if (body == null) builder.GET();
    else
      builder
          .header("Content-Type", "application/json")
          .method(method, HttpRequest.BodyPublishers.ofString(body.toString()));
    var response =
        http.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    if (response.statusCode() / 100 != 2)
      throw new IllegalStateException("Local API status " + response.statusCode());
    return json.readTree(response.body());
  }

  private JsonNode upload(long project, String csv) throws Exception {
    String boundary = "LabFlow" + UUID.randomUUID().toString().replace("-", "");
    String body =
        "--"
            + boundary
            + "\r\n"
            + "Content-Disposition: form-data; name=\"file\"; filename=\"synthetic-live.csv\"\r\n"
            + "Content-Type: text/csv\r\n\r\n"
            + csv
            + "\r\n--"
            + boundary
            + "--\r\n";
    var response =
        http.send(
            HttpRequest.newBuilder(URI.create(api + "/projects/" + project + "/datasets"))
                .timeout(Duration.ofSeconds(8))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() / 100 != 2)
      throw new IllegalStateException("Synthetic upload failed");
    return json.readTree(response.body());
  }
}
