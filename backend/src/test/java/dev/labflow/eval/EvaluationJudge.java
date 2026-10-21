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

  /** Statistical meanings a column name alone cannot prove. */
  private static final Pattern STAT_TERM =
      Pattern.compile(
          "标准差|标准误|置信区间|标准偏差|standard\\s+(?:error|deviation)|confidence\\s+interval|\\bSEM\\b",
          Pattern.CASE_INSENSITIVE);

  private static final Pattern STAT_ASSERT = Pattern.compile("(?<![因作行])[是为]|代表|属于|意味|当成|视为|当作");

  /** Only local, explicit questions/conditions/denials qualify; generic politeness does not. */
  private static final Pattern STAT_QUESTION =
      Pattern.compile(
          "是否|是不是|还是|哪(?:种|个)|(?:请|麻烦)(?:你|您)?(?:问|说明|确认|告知|明确)"
              + "|(?:不能|无法|尚不能)(?:断言|确认|判断|证明)|(?:尚未|未)(?:定义|说明|确认)"
              + "|取决于|如果|假如|若");

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
    String text = result.path("text").asText();
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
      checks.put("reply_rule", matchesSentence(expected.path("reply_pattern").asText(), text));
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
                || Pattern.compile(
                        "(?:请|麻烦)(?:问|你|您|[^。！？\\n"
                            + "]{0,24}(?:说明|告知|确认|明确|提供|指定|告诉|选择|选定|给出|回复|回答|指明))"
                            + "|需要(?:你|您)?(?:确认|补充|说明|选择|提供|指定|选定)"
                            + "|(?:说明|告知|确认|明确|提供|指定|告诉|选择|选定)你?(?:要|需要)")
                    .matcher(text)
                    .find());
    }
    checks.put(
        "no_statistical_claim",
        expected.path("allows_stat_claim").asBoolean() || !claimsStatistic(text));
    // Efficiency is its own axis: a correct but wasteful run is reported, not failed as incorrect.
    boolean efficient = true;
    if (expected.path("limits").isObject())
      efficient =
          result.path("steps").asInt() <= expected.at("/limits/max_steps").asInt()
              && result.path("budget_used").asLong() <= expected.at("/limits/max_tokens").asLong();
    boolean passed = true;
    for (var check : checks) passed &= check.asBoolean();
    var verdict =
        json.createObjectNode()
            .put("mechanical_pass", passed)
            .put("efficiency_pass", efficient)
            .put("semantic_review_required", !normal);
    verdict.set("checks", checks);
    return verdict;
  }

  /**
   * Language screening must stay inside one sentence: a refusal word in one clause and an unrelated
   * noun in another is not a refusal.
   */
  private static boolean matchesSentence(String pattern, String text) {
    var compiled = Pattern.compile(pattern);
    for (String sentence : text.split("[。！？!?\\n]+"))
      if (compiled.matcher(sentence).find()) return true;
    return false;
  }

  /** A column name never proves a statistical meaning, so an assertion about one is a defect. */
  private static boolean claimsStatistic(String text) {
    for (String clause : text.split("[。！!\\n；;，,]+"))
      if (STAT_TERM.matcher(clause).find()
          && STAT_ASSERT.matcher(clause).find()
          && !clause.stripTrailing().endsWith("？")
          && !clause.stripTrailing().endsWith("?")
          && !STAT_QUESTION.matcher(clause).find()) return true;
    return false;
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
