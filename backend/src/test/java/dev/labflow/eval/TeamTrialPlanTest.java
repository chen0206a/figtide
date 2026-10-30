package dev.labflow.eval;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class TeamTrialPlanTest {
  @Test void repeatedPairsAreReproducibleBalancedAndNeverDropAMode() {
    var ids = List.of("S01", "M09", "P01", "P13");
    var plan = TeamTrialPlan.pairs(ids, 3, 18027);
    assertEquals(plan, TeamTrialPlan.pairs(ids, 3, 18027));
    assertEquals(12, plan.size());
    assertEquals(6, plan.stream().filter(p -> p.modes().getFirst().equals("single")).count());
    for (String id : ids) {
      assertEquals(Set.of(1, 2, 3), new HashSet<>(plan.stream().filter(p -> p.id().equals(id)).map(TeamTrialPlan.Pair::repetition).toList()));
    }
    for (var pair : plan) assertEquals(Set.of("single", "team"), new HashSet<>(pair.modes()));
  }

  @Test void repetitionsAreAveragedWithinTaskBeforeBootstrap() {
    var means = TeamTrialPlan.taskMeans(Map.of("S01", List.of(1d, 0d, 1d), "M09", List.of(0d), "missing", List.of()));
    assertEquals(2, means.size());
    assertEquals(2d / 3, means.get("S01"));
    assertEquals(0d, means.get("M09"));
    assertFalse(means.containsKey("missing"));
    assertThrows(IllegalArgumentException.class, () -> TeamTrialPlan.pairs(List.of("S01", "S01"), 3, 1));
    assertThrows(IllegalArgumentException.class, () -> TeamTrialPlan.pairs(List.of("S01"), 0, 1));
  }

  @Test void comparisonUsesMatchedRepetitionsAndDoesNotOverwriteEarlierTrials() {
    var harness = new TeamEvaluationTest();
    harness.json = new com.fasterxml.jackson.databind.ObjectMapper();
    var rows = harness.json.createArrayNode();
    for (int repetition = 1; repetition <= 3; repetition++) {
      rows.addObject().put("id", "S01").put("repetition", repetition).put("agent_mode", "single").put("exact_config", true);
      rows.addObject().put("id", "S01").put("repetition", repetition).put("agent_mode", "team").put("exact_config", repetition != 2);
    }
    rows.addObject().put("id", "M09").put("repetition", 1).put("agent_mode", "single").put("exact_config", false);
    rows.addObject().put("id", "M09").put("repetition", 1).put("agent_mode", "team").put("exact_config", true);
    rows.addObject().put("id", "M09").put("repetition", 2).put("agent_mode", "single").put("exact_config", true);
    var comparison = harness.comparison(rows).path("exact_config");
    assertEquals(2, comparison.at("/single/n").asInt());
    assertEquals(.75, comparison.at("/single/mean").asDouble(), 1e-12);
    assertEquals(5d / 6, comparison.at("/team/mean").asDouble(), 1e-12);
    assertEquals(1d / 3, comparison.at("/paired_team_minus_single/mean").asDouble(), 1e-12);
  }

  @Test void observedRepliesAreRedactedWithoutRecordingInputMessages() throws Exception {
    var harness = new TeamEvaluationTest();
    harness.json = new com.fasterxml.jackson.databind.ObjectMapper();
    var provider = new dev.labflow.agent.ModelProvider() {
      public Info info() { return new Info(true, "test", "offline://test", ""); }
      public String redactSecret(String value) { return value.replace("test-secret", "[redacted]"); }
      public Reply complete(com.fasterxml.jackson.databind.node.ArrayNode messages, com.fasterxml.jackson.databind.node.ArrayNode tools, int max, java.time.Duration timeout) {
        return new Reply(harness.json.createObjectNode().put("role", "assistant").put("content", "test-secret"), 10, 20, "test", "stop");
      }
    };
    var observed = harness.new ObservedProvider(provider);
    var messages = harness.json.createArrayNode();
    messages.addObject().put("role", "system").put("content", "unrecorded-input");
    observed.complete(messages, harness.json.createArrayNode(), 100, java.time.Duration.ofSeconds(1));
    assertEquals("[redacted]", observed.exchanges.at("/0/message/content").asText());
    assertFalse(observed.exchanges.toString().contains("test-secret"));
    assertFalse(observed.exchanges.toString().contains("unrecorded-input"));
    assertEquals(10, observed.exchanges.at("/0/prompt_tokens").asInt());
  }

  @Test void unknownTokenUsageIsNotAFreeZeroMeasurement() {
    var harness = new TeamEvaluationTest();harness.json = new com.fasterxml.jackson.databind.ObjectMapper();
    var rows=harness.json.createArrayNode();
    rows.addObject().put("id","S01").put("repetition",1).put("agent_mode","single").put("tokens",100).put("usage_complete",true);
    rows.addObject().put("id","S01").put("repetition",2).put("agent_mode","single").put("tokens",0).put("usage_complete",false);
    rows.addObject().put("id","S01").put("repetition",1).put("agent_mode","team").put("tokens",200).put("usage_complete",true);
    rows.addObject().put("id","S01").put("repetition",2).put("agent_mode","team").put("tokens",300).put("usage_complete",true);
    var tokens=harness.comparison(rows).path("tokens");
    assertEquals(100,tokens.at("/single/mean").asDouble());
    assertEquals(250,tokens.at("/team/mean").asDouble());
    assertEquals(100,tokens.at("/paired_team_minus_single/mean").asDouble());
  }

  @Test void transportDiagnosticsKeepCauseTypesWithoutLeakingExceptionMessages() throws Exception {
    var harness = new TeamEvaluationTest();harness.json = new com.fasterxml.jackson.databind.ObjectMapper();
    var failure=new java.util.concurrent.ExecutionException("test-secret",new java.net.UnknownHostException("test-secret"));
    var provider=new dev.labflow.agent.ModelProvider(){
      public Info info(){return new Info(true,"test","offline://test","");}
      public Reply complete(com.fasterxml.jackson.databind.node.ArrayNode messages,com.fasterxml.jackson.databind.node.ArrayNode tools,int max,java.time.Duration timeout) throws Exception {throw failure;}
    };
    var observed=harness.new ObservedProvider(provider);
    var messages=harness.json.createArrayNode();messages.addObject().put("role","system").put("content","test");
    assertSame(failure,assertThrows(java.util.concurrent.ExecutionException.class,()->observed.complete(messages,harness.json.createArrayNode(),100,java.time.Duration.ofSeconds(1))));
    assertEquals("ExecutionException",observed.exchanges.at("/0/error_cause_types/0").asText());
    assertEquals("UnknownHostException",observed.exchanges.at("/0/error_cause_types/1").asText());
    assertFalse(observed.exchanges.toString().contains("test-secret"));
  }
}
