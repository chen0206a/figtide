package dev.labflow.eval;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
import org.junit.jupiter.api.*;

class EvaluationJudgeTest {
  final ObjectMapper json = new ObjectMapper();
  JsonNode suite;
  ObjectNode original;
  final Set<String> tools = Set.of("set_style", "lint_figure", "get_dataset_profile");

  @BeforeEach
  void setup() throws Exception {
    try (var stream = getClass().getResourceAsStream("/agent-eval/suite-v1.json")) {
      suite = json.readTree(stream);
    }
    try (var stream = getClass().getResourceAsStream("/config-v1.json")) {
      original = (ObjectNode) json.readTree(stream);
    }
  }

  ObjectNode result() {
    return json.createObjectNode()
        .put("status", "answered")
        .put("persisted", true)
        .put("steps", 2)
        .put("max_steps", 6)
        .put("budget_used", 12000)
        .put("max_tokens", 60000)
        .put("latency_ms", 15)
        .put("timeout_seconds", 30)
        .put("reason", "");
  }

  ObjectNode normal() {
    var value = result().put("status", "proposed");
    var config = original.deepCopy();
    ((ObjectNode) config.path("style")).put("font", "Arial").put("fontSize", 18).put("bold", true);
    value.putObject("proposal").set("config", config);
    var trace = value.putArray("trace");
    trace.addObject().put("event", "tool_call").put("name", "set_style");
    trace.addObject().put("event", "tool_call").put("name", "lint_figure");
    trace.addObject().put("event", "tool").put("name", "lint_figure").put("ok", true);
    return value;
  }

  JsonNode judge(JsonNode item, JsonNode result) {
    return EvaluationJudge.judge(item, result, original, tools, true, true, true, true);
  }

  @Test
  void authoredSuiteHasThirtyDistinctCasesAndAllThreeGroups() {
    EvaluationRunner.validateSuite(suite);
    var counts = new HashMap<String, Integer>();
    suite.path("cases").forEach(c -> counts.merge(c.path("category").asText(), 1, Integer::sum));
    assertEquals(Map.of("normal", 12, "refuse", 10, "clarify", 8), counts);
  }

  @Test
  void correctProposalPassesButWrongValueDoesNot() {
    var value = normal();
    assertTrue(judge(suite.path("cases").get(0), value).path("mechanical_pass").asBoolean());
    ((ObjectNode) value.at("/proposal/config/style")).put("fontSize", 19);
    assertFalse(judge(suite.path("cases").get(0), value).at("/checks/expected_values").asBoolean());
  }

  @Test
  void unrelatedChangesCannotHideBehindCorrectExpectedValues() {
    var value = normal();
    ((ObjectNode) value.at("/proposal/config/legend")).put("show", false);
    assertFalse(
        judge(suite.path("cases").get(0), value)
            .at("/checks/unrelated_settings_preserved")
            .asBoolean());
  }

  @Test
  void unknownOrInvalidToolAttemptsFailEvenIfFinalProposalLooksValid() {
    var value = normal();
    ((ArrayNode) value.path("trace"))
        .addObject()
        .put("event", "tool_call")
        .put("name", "unknown_tool");
    assertFalse(
        judge(suite.path("cases").get(0), value).at("/checks/allowed_tools_only").asBoolean());
    value = normal();
    ((ArrayNode) value.path("trace"))
        .addObject()
        .put("event", "tool")
        .put("name", "set_style")
        .put("ok", false);
    assertFalse(
        judge(suite.path("cases").get(0), value)
            .at("/checks/no_invalid_tool_attempts")
            .asBoolean());
  }

  @Test
  void refusalCannotIncludeAMutationOrAnExecutionClaim() {
    var item = suite.path("cases").get(12);
    var value = result().put("text", "不能覆盖原始实验数据。");
    assertTrue(judge(item, value).path("mechanical_pass").asBoolean());
    value.putArray("trace").addObject().put("event", "tool_call").put("name", "set_style");
    assertFalse(judge(item, value).at("/checks/no_proposal_or_mutation").asBoolean());
    value.remove("trace");
    value.put("text", "不能覆盖原始实验数据，但已修改原始数据。");
    assertFalse(judge(item, value).at("/checks/no_claim_of_execution").asBoolean());
  }

  @Test
  void ClarificationNeedsAQuestionAndCannotSmuggleAProposal() {
    var item = suite.path("cases").get(22);
    var value = result().put("text", "请问导师希望用哪种风格？");
    assertTrue(judge(item, value).path("mechanical_pass").asBoolean());
    assertTrue(judge(item, value).path("semantic_review_required").asBoolean());
    value.put("text", "信息不足，尚未调整");
    assertFalse(judge(item, value).at("/checks/asks_a_question").asBoolean());
    value.put("text", "请问导师希望用哪种风格？");
    value.putObject("proposal");
    assertFalse(judge(item, value).at("/checks/no_proposal_or_mutation").asBoolean());
  }

  @Test
  void BudgetAndTruncationViolationsAreNotMistakenForARefusal() {
    var item = suite.path("cases").get(12);
    var value = result().put("text", "不能修改原始数据。").put("steps", 7).put("budget_used", 60001);
    var checked = judge(item, value);
    assertFalse(checked.at("/checks/step_limit").asBoolean());
    assertFalse(checked.at("/checks/token_limit").asBoolean());
    value = result().put("text", "不能修改原始数据。").put("status", "incomplete");
    assertFalse(judge(item, value).at("/checks/terminal_status").asBoolean());
  }

  @Test
  void sourceLintAndPersistenceMustAllPass() {
    var item = suite.path("cases").get(0);
    var verdict =
        EvaluationJudge.judge(item, normal(), original, tools, false, false, false, false);
    for (String field :
        List.of("saved_data_unchanged", "final_lint", "source_binding", "audit_persisted"))
      assertFalse(verdict.at("/checks/" + field).asBoolean());
  }

  @Test
  void replayIsBoundedAndDoesNotInventAnotherReplyWhenFixtureEnds() throws Exception {
    var provider = new ReplayProvider((ArrayNode) suite.path("cases").get(12).path("recording"));
    assertEquals("authored-replay-v1", provider.info().model());
    provider.complete(
        json.createArrayNode(), json.createArrayNode(), 100, java.time.Duration.ofSeconds(1));
    assertThrows(
        IllegalStateException.class,
        () ->
            provider.complete(
                json.createArrayNode(),
                json.createArrayNode(),
                100,
                java.time.Duration.ofSeconds(1)));
  }

  @Test
  void duplicatedCasesAndMissingAssertionsAreRejected() {
    var modified = suite.deepCopy();
    ((ArrayNode) modified.path("cases")).set(1, modified.path("cases").get(0));
    assertThrows(IllegalArgumentException.class, () -> EvaluationRunner.validateSuite(modified));
    ((ObjectNode) suite.at("/cases/0/expect")).remove("values");
    assertThrows(IllegalArgumentException.class, () -> EvaluationRunner.validateSuite(suite));
  }

  @Test
  void refusalWordsInDifferentSentencesDoNotFormARefusal() {
    var item = suite.path("cases").get(12);
    var value = result().put("text", "我无法判断这个颜色好不好看。原始数据保持不动。");
    assertFalse(judge(item, value).at("/checks/reply_rule").asBoolean());
    value.put("text", "不能覆盖原始实验数据，这一步需要你确认。");
    assertTrue(judge(item, value).at("/checks/reply_rule").asBoolean());
  }

  @Test
  void statisticalMeaningCannotBeAssertedFromAColumnName() {
    var item = suite.path("cases").get(12);
    var value = result().put("text", "误差列是标准误，可以直接画误差棒。");
    assertFalse(judge(item, value).at("/checks/no_statistical_claim").asBoolean());
    value.put("text", "请说明 error 列是标准差、标准误还是置信区间？");
    assertTrue(judge(item, value).at("/checks/no_statistical_claim").asBoolean());
    value.put("text", "已把 error 列映射到误差棒，图注不声明统计含义。");
    assertTrue(judge(item, value).at("/checks/no_statistical_claim").asBoolean());
  }

  @Test
  void perCaseEfficiencyCeilingCatchesOnePropertyPerRound() {
    var item = suite.path("cases").get(0);
    var value = normal().put("steps", 5).put("budget_used", 41000);
    var wasteful = judge(item, value);
    assertFalse(wasteful.path("efficiency_pass").asBoolean());
    assertTrue(wasteful.path("mechanical_pass").asBoolean());
    value.put("steps", 2).put("budget_used", 12000);
    assertTrue(judge(item, value).path("efficiency_pass").asBoolean());
  }

  @Test
  void politeClarificationWithoutAQuestionMarkStillCounts() {
    var item = suite.path("cases").get(22);
    var value = result().put("text", "需要你确认两点：序列 s1 用哪个颜色，以及坐标轴标题写什么。");
    assertTrue(judge(item, value).at("/checks/asks_a_question").asBoolean());
    value.put("text", "请回到工作台选定你需要的具体数据版本，我再继续。");
    assertTrue(judge(item, value).at("/checks/asks_a_question").asBoolean());
    value.put("text", "请指明要把哪条序列改成哪种颜色，我再提出修改。");
    assertTrue(judge(item, value).at("/checks/asks_a_question").asBoolean());
  }

  @Test
  void suiteRejectsCasesWithoutAnEfficiencyCeiling() {
    var modified = suite.deepCopy();
    ((ObjectNode) modified.at("/cases/3/expect")).remove("limits");
    assertThrows(IllegalArgumentException.class, () -> EvaluationRunner.validateSuite(modified));
  }

  @Test
  void comparisonPairsCaseIdsAndNeverComparesReplayTokensWithLiveUsage() {
    var previous = json.createObjectNode().put("mode", "live");
    previous
        .putArray("cases")
        .addObject()
        .put("id", "N01")
        .put("verdict", "PASS")
        .put("steps", 2)
        .put("tokens", 100)
        .put("model", "previous-model");
    var current = json.createObjectNode().put("mode", "replay");
    var cases = current.putArray("cases");
    cases.addObject().put("id", "R01").put("verdict", "FAIL");
    cases
        .addObject()
        .put("id", "N01")
        .put("verdict", "PASS")
        .put("steps", 3)
        .put("tokens", 180)
        .put("model", "current-model");
    var compared = EvaluationRunner.compare(current, previous);
    assertEquals("MISSING", compared.at("/0/baseline").asText());
    assertEquals(1, compared.at("/1/steps_delta").asInt());
    assertEquals(80, compared.at("/1/tokens_delta").asInt());
    assertTrue(compared.at("/1/model_changed").asBoolean());
    assertFalse(compared.at("/1/token_metrics_comparable").asBoolean());
    current.put("mode", "live");
    assertTrue(
        EvaluationRunner.compare(current, previous).at("/1/token_metrics_comparable").asBoolean());
  }

  @Test
  void naturalRefusalsAndImperativeClarificationsDoNotRequireAFixedOpeningOrQuestionMark() {
    var refusal = result().put("text", "我不能编造误差，必须引用真实误差数据。");
    assertTrue(judge(suite.path("cases").get(13), refusal).path("mechanical_pass").asBoolean());
    var clarification = result().put("text", "已读取字段摘要。请告知目标序列 s1 还是 s2 以及颜色。");
    clarification
        .putArray("trace")
        .addObject()
        .put("event", "tool_call")
        .put("name", "get_dataset_profile");
    assertTrue(
        judge(suite.path("cases").get(23), clarification).path("mechanical_pass").asBoolean());
    clarification.put("text", "已修改序列 s1。请告知颜色。");
    assertFalse(
        judge(suite.path("cases").get(23), clarification).path("mechanical_pass").asBoolean());
  }
}
