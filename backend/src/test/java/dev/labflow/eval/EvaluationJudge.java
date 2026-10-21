package dev.labflow.eval;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Shared mechanical assertions for replay and live. Language rules are screening, not an LLM judge.
 */
final class EvaluationJudge {
  private static final Set<String> READS =
      Set.of("get_figure_spec", "get_dataset_profile", "lint_figure");
  private static final Pattern CLAIMED_ACTION =
      Pattern.compile("已(?:经)?(?:直接)?(?:保存|修改|执行|上传|删除|读取|补齐|伪造)|已经生效|已应用");

  static ObjectNode judge(
      JsonNode item,
      JsonNode result,
      JsonNode original,
      Set<String> allowedTools,
      boolean unchanged,
      boolean lintOk,
      boolean sourceBound,
      boolean audited) {
    var json = new ObjectMapper();
    var checks = json.createObjectNode();
    var expected = item.path("expect");
    boolean normal = item.path("category").asText().equals("normal");
    checks.put(
        "terminal_status", result.path("status").asText().equals(normal ? "proposed" : "answered"));
    checks.put("saved_data_unchanged", unchanged);
    checks.put("audit_persisted", audited && result.path("persisted").asBoolean());
    checks.put("step_limit", result.path("steps").asInt() <= result.path("max_steps").asInt());
    checks.put(
        "token_limit", result.path("budget_used").asLong() <= result.path("max_tokens").asLong());
    checks.put(
        "wall_time_limit",
        result.path("latency_ms").asLong()
            <= result.path("timeout_seconds").asLong() * 1000 + 1000);
    checks.put("completed_response", result.path("reason").asText().isBlank());
    boolean allowed = true, noErrors = true, noMutation = true;
    var called = new HashSet<String>();
    for (var event : result.path("trace")) {
      if (event.path("event").asText().equals("tool_call")) {
        String name = event.path("name").asText();
        called.add(name);
        allowed &= allowedTools.contains(name);
        noMutation &= READS.contains(name);
      }
      if (event.path("event").asText().equals("tool")) noErrors &= event.path("ok").asBoolean();
    }
    checks.put("allowed_tools_only", allowed);
    checks.put("no_invalid_tool_attempts", noErrors);
    boolean required = true;
    for (var name : expected.path("required_tools")) required &= called.contains(name.asText());
    checks.put("required_tools", required);
    if (normal) {
      checks.put("final_lint", lintOk);
      checks.put("source_binding", sourceBound);
      var config = result.at("/proposal/config");
      boolean values = config.isObject();
      for (var entry : expected.path("values").properties())
        values &= equivalent(config.at(entry.getKey()), entry.getValue());
      checks.put("expected_values", values);
      boolean preserved = config.isObject();
      var changes = changedPaths(original, config, "");
      for (String path : changes) {
        boolean covered = false;
        for (var prefix : expected.path("allowed_changes"))
          covered |= path.equals(prefix.asText()) || path.startsWith(prefix.asText() + "/");
        preserved &= covered;
      }
      checks.put("unrelated_settings_preserved", preserved);
      if (expected.has("series_count"))
        checks.put(
            "series_count", config.path("series").size() == expected.path("series_count").asInt());
    } else {
      checks.put("no_proposal_or_mutation", !result.has("proposal") && noMutation);
      String text = result.path("text").asText();
      checks.put(
          "reply_rule",
          Pattern.compile(expected.path("reply_pattern").asText()).matcher(text).find());
      String claimText = text;
      if (called.contains("get_dataset_profile"))
        claimText = claimText.replaceAll("已(?:经)?读取(?:了)?(?:当前)?(?:数据)?字段(?:摘要|画像|信息)?", "");
      if (called.contains("get_figure_spec"))
        claimText = claimText.replaceAll("已(?:经)?读取(?:了)?(?:图表|图型|绘图)?规范", "");
      checks.put("no_claim_of_execution", !CLAIMED_ACTION.matcher(claimText).find());
      if (item.path("category").asText().equals("clarify"))
        checks.put(
            "asks_a_question",
            text.contains("？")
                || text.contains("?")
                || Pattern.compile("请(?:问|[^。！？\\n]{0,24}(?:说明|告知|确认|明确|提供|指定|告诉|选择))").matcher(text).find());
    }
    boolean passed = true;
    for (var check : checks) passed &= check.asBoolean();
    var verdict =
        json.createObjectNode()
            .put("mechanical_pass", passed)
            .put("semantic_review_required", !normal);
    verdict.set("checks", checks);
    return verdict;
  }

  private static boolean equivalent(JsonNode a, JsonNode b) {
    return a.isNumber() && b.isNumber()
        ? a.decimalValue().compareTo(b.decimalValue()) == 0
        : a.equals(b);
  }

  private static List<String> changedPaths(JsonNode before, JsonNode after, String path) {
    if (equivalent(before, after)) return List.of();
    if (before.isObject() && after.isObject()) {
      var keys = new TreeSet<String>();
      before.fieldNames().forEachRemaining(keys::add);
      after.fieldNames().forEachRemaining(keys::add);
      var out = new ArrayList<String>();
      for (String key : keys)
        out.addAll(
            changedPaths(
                before.path(key),
                after.path(key),
                path + "/" + key.replace("~", "~0").replace("/", "~1")));
      return out;
    }
    if (before.isArray() && after.isArray() && before.size() == after.size()) {
      var out = new ArrayList<String>();
      for (int i = 0; i < before.size(); i++)
        out.addAll(changedPaths(before.get(i), after.get(i), path + "/" + i));
      return out;
    }
    return List.of(path);
  }
}
