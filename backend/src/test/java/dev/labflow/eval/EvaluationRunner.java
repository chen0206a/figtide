package dev.labflow.eval;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.*;
import dev.labflow.service.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * CLI via Maven/JUnit; absent from the production JAR. Exercises the actual Java harness and DB.
 */
final class EvaluationRunner {
  /**
   * Hard ceiling for one live run. Prices are a worst-case placeholder, so the ceiling errs on the
   * safe side; override with -Dlabflow.eval.maxCostCny / -Dlabflow.eval.pricePerMillionCny.
   */
  private static final double MAX_COST_CNY =
      Double.parseDouble(System.getProperty("labflow.eval.maxCostCny", "6"));

  private static final double PRICE_PER_MILLION_CNY =
      Double.parseDouble(System.getProperty("labflow.eval.pricePerMillionCny", "8"));

  private static double estimateCny(long tokens) {
    return tokens / 1_000_000.0 * PRICE_PER_MILLION_CNY;
  }

  private final ObjectMapper json;
  private final WorkspaceService workspace;
  private final FigureToolService figures;
  private final AgentAuditService audit;
  private final JdbcTemplate db;
  private final TransactionTemplate transaction;

  EvaluationRunner(
      ObjectMapper json,
      WorkspaceService workspace,
      FigureToolService figures,
      AgentAuditService audit,
      JdbcTemplate db,
      TransactionTemplate transaction) {
    this.json = json;
    this.workspace = workspace;
    this.figures = figures;
    this.audit = audit;
    this.db = db;
    this.transaction = transaction;
  }

  ObjectNode run(
      JsonNode suite,
      String mode,
      Set<String> selected,
      ModelProvider live,
      Path output,
      JsonNode baseline)
      throws Exception {
    validateSuite(suite);
    if (!Set.of("replay", "live").contains(mode))
      throw new IllegalArgumentException("Unknown evaluation mode");
    if (mode.equals("live") && (live == null || !live.info().available()))
      throw new IllegalArgumentException(
          "Live evaluation requires an explicitly configured provider");
    Set<String> known = new HashSet<>();
    suite.path("cases").forEach(c -> known.add(c.path("id").asText()));
    if (!known.containsAll(selected))
      throw new IllegalArgumentException("Unknown evaluation case id");
    try (var connection = Objects.requireNonNull(db.getDataSource()).getConnection()) {
      if (!connection
          .getMetaData()
          .getURL()
          .matches("jdbc:mysql://[^/]+/labflow_(test|e2e)(\\?.*)?"))
        throw new IllegalStateException(
            "Evaluation only permits isolated labflow_test / labflow_e2e schemas");
    }
    JsonNode baseConfig;
    try (var stream = getClass().getResourceAsStream("/config-v1.json")) {
      baseConfig = json.readTree(stream);
    }
    var definition = json.createObjectNode();
    definition.set("suite", suite);
    definition.set("base_config", baseConfig);
    String suiteHash = AuditSanitizer.hash(definition);
    if (baseline != null
        && (!baseline.path("report_version").asText().equals("1")
            || !baseline.path("suite_hash").asText().equals(suiteHash)))
      throw new IllegalArgumentException(
          "Baseline must use report v1 and the identical suite hash");
    var report =
        json.createObjectNode()
            .put("report_version", 1)
            .put("mode", mode)
            .put("suite_version", suite.path("suite_version").asText())
            .put("suite_hash", suiteHash)
            .put("fixture_config_hash", AuditSanitizer.hash(baseConfig))
            .put("protocol_version", 1)
            .put("config_schema_version", 1)
            .put("fixture_provenance", suite.path("fixture_provenance").asText())
            .put("started_at", Instant.now().toString())
            .put("prompt_version", AgentRunService.PROMPT_VERSION)
            .put(
                "token_usage_kind",
                mode.equals("replay") ? "synthetic_fixture_counts" : "provider_reported")
            .put(
                "scope",
                "Synthetic data only; mechanical pass is not proof of semantic correctness."
                    + " Refuse/clarify live results require human review.");
    var rows = report.putArray("cases");
    var skipped = report.putArray("skipped_by_budget");
    long spentTokens = 0;
    for (var item : suite.path("cases")) {
      if (!selected.isEmpty() && !selected.contains(item.path("id").asText())) continue;
      if (mode.equals("live") && estimateCny(spentTokens) >= MAX_COST_CNY) {
        skipped.add(item.path("id").asText());
        continue;
      }
      var row = evaluate(item, suite, mode, live);
      spentTokens += row.path("tokens").asLong();
      rows.add(row);
      if (!report.has("catalog_hash"))
        report.put("catalog_hash", row.path("catalog_hash").asText());
      System.out.printf(
          "EVAL %-4s %-7s %-6s steps=%d%n",
          row.path("id").asText(),
          row.path("category").asText(),
          row.path("verdict").asText(),
          row.path("steps").asInt());
    }
    report.put("finished_at", Instant.now().toString());
    report
        .putObject("cost")
        .put("ceiling_cny", MAX_COST_CNY)
        .put("worst_case_price_per_million_cny", PRICE_PER_MILLION_CNY)
        .put("spent_tokens", spentTokens)
        .put("estimated_cny", estimateCny(spentTokens))
        .put("skipped_cases", skipped.size())
        .put("note", "Worst-case token pricing; the provider does not split prompt/completion here.");
    report.set("summary", summarize(json, rows));
    if (baseline != null) {
      report.set("comparison", compare(report, baseline));
      report
          .putObject("baseline")
          .put("report_hash", AuditSanitizer.hash(baseline))
          .put("mode", baseline.path("mode").asText())
          .put("started_at", baseline.path("started_at").asText());
    }
    Path absolute = output.toAbsolutePath().normalize();
    Files.createDirectories(absolute.getParent());
    Files.writeString(
        Path.of(absolute + ".json"),
        json.writerWithDefaultPrettyPrinter().writeValueAsString(report),
        StandardCharsets.UTF_8);
    Files.writeString(Path.of(absolute + ".md"), markdown(report), StandardCharsets.UTF_8);
    return report;
  }

  private ObjectNode evaluate(JsonNode item, JsonNode suite, String mode, ModelProvider live)
      throws Exception {
    long project = 0;
    var row =
        json.createObjectNode()
            .put("id", item.path("id").asText())
            .put("category", item.path("category").asText())
            .put("prompt", item.path("prompt").asText())
            .put("review_rubric", item.path("review_rubric").asText());
    try {
      project =
          ((Number)
                  workspace
                      .createProject(
                          "Evaluation " + item.path("id").asText(),
                          "Synthetic evaluation; temporary owned fixture")
                      .get("id"))
              .longValue();
      long dataset =
          ((Number)
                  workspace
                      .upload(
                          project,
                          null,
                          "synthetic-evaluation.csv",
                          suite.path("csv").asText().getBytes(StandardCharsets.UTF_8))
                      .get("id"))
              .longValue();
      ObjectNode config;
      try (var stream = getClass().getResourceAsStream("/config-v1.json")) {
        config = (ObjectNode) json.readTree(stream);
      }
      // Only static corpus setup can alter the fixture. No expected result is passed to a live
      // provider.
      for (var entry : item.path("setup").properties())
        set(config, entry.getKey(), entry.getValue());
      config.put("datasetVersionId", dataset);
      long chart =
          ((Number)
                  workspace.saveChart(project, null, "Evaluation fixture", null, config).get("id"))
              .longValue();
      String before = fingerprint(json, db, project);
      ModelProvider provider =
          mode.equals("replay") ? new ReplayProvider((ArrayNode) item.path("recording")) : live;
      try (var harness =
          new HarnessHandle(new AgentRunService(provider, figures, workspace, json, audit))) {
        var request =
            json.createObjectNode()
                .put("protocol_version", 1)
                .put("chart_id", chart)
                .put("base_revision", 1)
                .put("share_metadata", true)
                .put("prompt", item.path("prompt").asText())
                .put("max_steps", 6)
                .put("max_tokens", 60000)
                .put("timeout_seconds", 30);
        request.set("config", config.deepCopy());
        String run =
            json.valueToTree(harness.agent.start(project, request)).path("run_id").asText();
        JsonNode result = await(harness.agent, project, run);
        var record = audit.detail(project, run);
        var envelope = request.deepCopy();
        envelope.remove(
            List.of("prompt", "share_metadata", "max_steps", "max_tokens", "timeout_seconds"));
        envelope.set("config", result.at("/proposal/config"));
        boolean lint =
            result.has("proposal")
                && Boolean.TRUE.equals(figures.lint(project, envelope).get("ok"));
        boolean source =
            result.at("/proposal/source/dataset_version_id").asLong() == dataset
                && result.at("/proposal/config/datasetVersionId").asLong() == dataset
                && result
                    .at("/proposal/source/sha256")
                    .asText()
                    .equals(workspace.data(project, dataset).get("sha256"));
        var allowed = new HashSet<String>();
        harness.agent.definitions().forEach(t -> allowed.add(t.at("/function/name").asText()));
        row.setAll(
            EvaluationJudge.judge(
                item,
                result,
                config,
                allowed,
                before.equals(fingerprint(json, db, project)),
                lint,
                source,
                record.path("status").equals(result.path("status"))
                    && record.path("usage_complete").asBoolean()));
        boolean passed = row.path("mechanical_pass").asBoolean();
        row.put(
            "verdict",
            !passed
                ? "FAIL"
                : mode.equals("live") && !row.path("efficiency_pass").asBoolean()
                    ? "SLOW"
                    : mode.equals("live") && row.path("semantic_review_required").asBoolean()
                        ? "REVIEW"
                        : "PASS");
        for (String field :
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
                "prompt_version")) row.set(field, result.path(field));
        row.put("model", AuditSanitizer.note(result.path("model").asText()));
        row.put("final_text", AuditSanitizer.note(result.path("text").asText()));
        row.set("reason_code", record.path("reason_code"));
        row.set("trace", record.path("trace"));
        row.set("proposal_summary", record.path("proposal_summary"));
      }
    } catch (Exception error) {
      // Never include upstream bodies, secret-bearing messages or arbitrary stack traces in
      // reports.
      row.put("mechanical_pass", false)
          .put("verdict", "FAIL")
          .put("infrastructure_error", error.getClass().getSimpleName());
    } finally {
      if (project != 0) cleanup(db, transaction, project);
    }
    return row;
  }

  private JsonNode await(AgentRunService agent, long project, String id) throws Exception {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(33);
    while (System.nanoTime() < deadline) {
      var value = json.valueToTree(agent.get(project, id));
      if (!Set.of("queued", "running").contains(value.path("status").asText())) return value;
      Thread.sleep(10);
    }
    agent.cancel(project, id);
    throw new IllegalStateException("Evaluation wait exceeded harness timeout");
  }

  static String fingerprint(ObjectMapper json, JdbcTemplate db, long project) {
    var value = json.createArrayNode();
    value.add(json.valueToTree(db.queryForList("SELECT * FROM projects WHERE id=?", project)));
    value.add(
        json.valueToTree(
            db.queryForList("SELECT * FROM charts WHERE project_id=? ORDER BY id", project)));
    value.add(
        json.valueToTree(
            db.queryForList(
                "SELECT v.* FROM chart_versions v JOIN charts c ON c.id=v.chart_id WHERE"
                    + " c.project_id=? ORDER BY v.id",
                project)));
    value.add(
        json.valueToTree(
            db.queryForList("SELECT * FROM datasets WHERE project_id=? ORDER BY id", project)));
    value.add(
        json.valueToTree(
            db.queryForList(
                "SELECT v.* FROM dataset_versions v JOIN datasets d ON d.id=v.dataset_id WHERE"
                    + " d.project_id=? ORDER BY v.id",
                project)));
    value.add(
        json.valueToTree(
            db.queryForList("SELECT * FROM experiments WHERE project_id=? ORDER BY id", project)));
    value.add(
        json.valueToTree(
            db.queryForList(
                "SELECT * FROM style_templates WHERE project_id=? ORDER BY id", project)));
    return AuditSanitizer.hash(value);
  }

  static void cleanup(JdbcTemplate db, TransactionTemplate transaction, long project) {
    // Exact id created by this invocation, never a watermark, name match, or other user's project.
    transaction.executeWithoutResult(
        status -> {
          db.update(
              "DELETE FROM chart_versions WHERE chart_id IN (SELECT id FROM charts WHERE"
                  + " project_id=?)",
              project);
          db.update("DELETE FROM charts WHERE project_id=?", project);
          db.update(
              "DELETE FROM experiment_datasets WHERE experiment_id IN (SELECT id FROM experiments"
                  + " WHERE project_id=?)",
              project);
          db.update(
              "DELETE FROM dataset_versions WHERE dataset_id IN (SELECT id FROM datasets WHERE"
                  + " project_id=?)",
              project);
          db.update("DELETE FROM datasets WHERE project_id=?", project);
          db.update("DELETE FROM experiments WHERE project_id=?", project);
          db.update("DELETE FROM style_templates WHERE project_id=?", project);
          db.update("DELETE FROM projects WHERE id=?", project);
        });
  }

  static void set(ObjectNode root, String pointer, JsonNode value) {
    int split = pointer.lastIndexOf('/');
    var parent = root.at(pointer.substring(0, split));
    if (!(parent instanceof ObjectNode object))
      throw new IllegalArgumentException("Invalid setup path");
    object.set(
        pointer.substring(split + 1).replace("~1", "/").replace("~0", "~"), value.deepCopy());
  }

  static void validateSuite(JsonNode suite) {
    if (!suite.path("cases").isArray()
        || suite.path("cases").size() != 30
        || !suite
            .path("fixture_provenance")
            .asText()
            .equals("hand-authored synthetic assistant outputs; not captured model responses"))
      throw new IllegalArgumentException("Expected a versioned 30-case authored suite");
    var ids = new HashSet<String>();
    var categories = new HashSet<String>();
    for (var item : suite.path("cases")) {
      String category = item.path("category").asText();
      categories.add(category);
      if (!ids.add(item.path("id").asText())
          || !item.path("id").asText().matches("[NRC][0-9]{2}")
          || !Set.of("normal", "refuse", "clarify").contains(category)
          || item.path("prompt").asText().isBlank()
          || item.path("review_rubric").asText().isBlank()
          || !item.path("recording").isArray()
          || item.path("recording").isEmpty()
          || !item.path("expect").isObject())
        throw new IllegalArgumentException("Invalid or duplicate evaluation case");
      if (!item.at("/expect/limits").isObject()
          || item.at("/expect/limits/max_steps").asInt() < 1
          || item.at("/expect/limits/max_steps").asInt() > 8
          || item.at("/expect/limits/max_tokens").asLong() < 2000
          || item.at("/expect/limits/max_tokens").asLong() > 60000)
        throw new IllegalArgumentException(
            "Every case needs a step and token ceiling that fits the harness budget");
      if (category.equals("normal")) {
        if (!item.at("/expect/values").isObject()
            || item.at("/expect/values").isEmpty()
            || !item.at("/expect/allowed_changes").isArray()
            || item.at("/expect/allowed_changes").isEmpty()
            || !item.at("/expect/required_tools").isArray()
            || !item.at("/expect/required_tools").toString().contains("\"lint_figure\""))
          throw new IllegalArgumentException(
              "Normal case needs concrete effects and change boundaries");
      } else {
        String pattern = item.at("/expect/reply_pattern").asText();
        if (pattern.isBlank())
          throw new IllegalArgumentException("Missing language screening rule");
        java.util.regex.Pattern.compile(pattern);
      }
      for (var turn : item.path("recording"))
        if (!turn.path("message").isObject()
            || !turn.at("/message/role").asText().equals("assistant")
            || !turn.path("prompt_tokens").isIntegralNumber()
            || turn.path("prompt_tokens").asInt() < 0
            || !turn.path("completion_tokens").isIntegralNumber()
            || turn.path("completion_tokens").asInt() < 0
            || !Set.of("stop", "tool_calls").contains(turn.path("finish_reason").asText()))
          throw new IllegalArgumentException("Invalid authored recording");
    }
    if (categories.size() != 3) throw new IllegalArgumentException("All three categories required");
  }

  static ObjectNode summarize(ObjectMapper json, ArrayNode rows) {
    var out = json.createObjectNode().put("total", rows.size());
    int passed = 0,
        review = 0,
        slow = 0,
        proposed = 0,
        answered = 0,
        stopped = 0,
        toolCalls = 0,
        toolBlocked = 0;
    long steps = 0, tokens = 0, ms = 0;
    var groups = out.putObject("categories");
    for (var row : rows) {
      boolean ok = row.path("mechanical_pass").asBoolean();
      passed += ok ? 1 : 0;
      slow += row.path("efficiency_pass").asBoolean() ? 0 : 1;
      review += row.path("semantic_review_required").asBoolean() ? 1 : 0;
      proposed += row.path("status").asText().equals("proposed") ? 1 : 0;
      answered += row.path("status").asText().equals("answered") ? 1 : 0;
      stopped +=
          Set.of("failed", "incomplete", "cancelled").contains(row.path("status").asText()) ? 1 : 0;
      for (var event : row.path("trace")) {
        toolCalls += event.path("event").asText().equals("tool_call") ? 1 : 0;
        toolBlocked +=
            event.path("event").asText().equals("tool") && !event.path("ok").asBoolean() ? 1 : 0;
      }
      steps += row.path("steps").asLong();
      tokens += row.path("tokens").asLong();
      ms += row.path("latency_ms").asLong();
      var group = groups.withObjectProperty(row.path("category").asText());
      group
          .put("total", group.path("total").asInt() + 1)
          .put("mechanical_pass", group.path("mechanical_pass").asInt() + (ok ? 1 : 0));
    }
    out.put("mechanical_pass", passed)
        .put("failed", rows.size() - passed)
        .put("semantic_review_cases", review)
        .put("inefficient_cases", slow)
        .put("mechanical_pass_rate", rows.isEmpty() ? 0 : (double) passed / rows.size())
        .put("proposed_count", proposed)
        .put("answered_count", answered)
        .put("steps", steps)
        .put("tokens", tokens)
        .put("latency_ms", ms)
        .put("mean_steps", rows.isEmpty() ? 0 : (double) steps / rows.size())
        .put("mean_tokens", rows.isEmpty() ? 0 : (double) tokens / rows.size())
        .put("mean_latency_ms", rows.isEmpty() ? 0 : (double) ms / rows.size())
        .put("harness_stopped_count", stopped)
        .put("tool_calls", toolCalls)
        .put("blocked_tool_calls", toolBlocked);
    for (var group : groups) {
      ((ObjectNode) group)
          .put(
              "mechanical_pass_rate",
              (double) group.path("mechanical_pass").asInt() / group.path("total").asInt());
    }
    // No generic "refusal rate": answered includes both refusals and clarification questions.
    return out;
  }

  static ArrayNode compare(JsonNode current, JsonNode baseline) {
    var json = new ObjectMapper();
    var out = json.createArrayNode();
    var old = new HashMap<String, JsonNode>();
    baseline.path("cases").forEach(c -> old.put(c.path("id").asText(), c));
    for (var row : current.path("cases")) {
      var previous = old.get(row.path("id").asText());
      var item =
          out.addObject()
              .put("id", row.path("id").asText())
              .put("current", row.path("verdict").asText());
      if (previous == null) {
        item.put("baseline", "MISSING");
        continue;
      }
      item.put("baseline", previous.path("verdict").asText());
      for (String metric : List.of("steps", "tokens", "latency_ms"))
        item.put(metric + "_delta", row.path(metric).asLong() - previous.path(metric).asLong());
      item.put("model_changed", !row.path("model").equals(previous.path("model")))
          .put(
              "prompt_changed", !row.path("prompt_version").equals(previous.path("prompt_version")))
          .put("catalog_changed", !row.path("catalog_hash").equals(previous.path("catalog_hash")))
          .put(
              "token_metrics_comparable",
              baseline.path("mode").asText().equals("live")
                  && current.path("mode").asText().equals("live"));
    }
    return out;
  }

  static String markdown(JsonNode report) {
    var text = new StringBuilder("# LabFlow agent evaluation\n\n");
    text.append("Mode: **")
        .append(report.path("mode").asText())
        .append("** · Suite: `")
        .append(report.path("suite_version").asText())
        .append("` · Prompt: `")
        .append(report.path("prompt_version").asText())
        .append("`\n\n")
        .append(
            "Replay outputs and token counts are hand-authored synthetic fixtures, not real model"
                + " results. Refusal/clarification rules are mechanical screening; live REVIEW rows"
                + " require human assessment.\n\n")
        .append("Mechanical checks: **")
        .append(report.at("/summary/mechanical_pass").asInt())
        .append("/")
        .append(report.at("/summary/total").asInt())
        .append("**.\n\n");
    if (report.has("cost"))
      text.append("Spend ceiling **¥")
          .append(report.at("/cost/ceiling_cny").asDouble())
          .append("**; estimated **¥")
          .append(
              String.format(
                  java.util.Locale.ROOT, "%.2f", report.at("/cost/estimated_cny").asDouble()))
          .append("** for ")
          .append(report.at("/cost/spent_tokens").asLong())
          .append(" tokens at the worst-case price ")
          .append(report.at("/cost/worst_case_price_per_million_cny").asDouble())
          .append(" CNY per million")
          .append(
              report.at("/cost/skipped_cases").asInt() > 0
                  ? "; **" + report.at("/cost/skipped_cases").asInt() + " cases skipped by budget**"
                  : "")
          .append(".\n\n");
    text.append(
            "| Case | Category | Verdict | Steps | Tokens | ms | Failed checks |\n"
                + "|---|---|---|---:|---:|---:|---|\n");
    for (var row : report.path("cases")) {
      var failed = new ArrayList<String>();
      row.path("checks")
          .properties()
          .forEach(
              e -> {
                if (!e.getValue().asBoolean()) failed.add(e.getKey());
              });
      if (row.has("infrastructure_error")) failed.add(row.path("infrastructure_error").asText());
      if (row.has("efficiency_pass") && !row.path("efficiency_pass").asBoolean())
        failed.add("efficiency_target");
      text.append("| ")
          .append(row.path("id").asText())
          .append(" | ")
          .append(row.path("category").asText())
          .append(" | ")
          .append(row.path("verdict").asText())
          .append(" | ")
          .append(row.path("steps").asInt())
          .append(" | ")
          .append(row.path("tokens").asLong())
          .append(" | ")
          .append(row.path("latency_ms").asLong())
          .append(" | ")
          .append(String.join(", ", failed))
          .append(" |\n");
    }
    if (report.has("comparison")) {
      text.append(
          "\n"
              + "## Comparison by case id\n\n"
              + "Same suite hash required. Replay/live token counts cannot be used as an efficiency"
              + " comparison.\n\n"
              + "| Case | Baseline | Current | Δ steps | Δ tokens | Δ ms |\n"
              + "|---|---|---|---:|---:|---:|\n");
      for (var row : report.path("comparison"))
        text.append("| ")
            .append(row.path("id").asText())
            .append(" | ")
            .append(row.path("baseline").asText())
            .append(" | ")
            .append(row.path("current").asText())
            .append(" | ")
            .append(row.path("steps_delta").asLong())
            .append(" | ")
            .append(row.path("tokens_delta").asLong())
            .append(" | ")
            .append(row.path("latency_ms_delta").asLong())
            .append(" |\n");
    }
    text.append("\n## Response review\n\n");
    for (var row : report.path("cases")) {
      text.append("- **")
          .append(row.path("id").asText())
          .append("** ")
          .append(escape(row.path("prompt").asText()))
          .append("\n  - Rubric: ")
          .append(escape(row.path("review_rubric").asText()))
          .append("\n  - Reply: ")
          .append(escape(row.path("final_text").asText()))
          .append("\n");
    }
    return text.toString();
  }

  private static String escape(String text) {
    return text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", " ")
        .replace("|", "\\|")
        .replace("[", "\\[")
        .replace("]", "\\]");
  }

  private record HarnessHandle(AgentRunService agent) implements AutoCloseable {
    public void close() {
      agent.close();
    }
  }
}
