package dev.labflow.eval;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class EvaluationSpendBudgetTest {
  final ObjectMapper json = new ObjectMapper();

  @Test
  void preflightReservesWholeCaseAndReleasesOnlyKnownUnusedUsage() {
    var budget = new EvaluationSpendBudget("0.48", "8");
    assertTrue(budget.canStartCase());
    budget.record(json.createObjectNode().put("tokens", 1).put("usage_complete", true));
    assertFalse(budget.canStartCase());
    assertEquals(1, budget.report(json, 1).path("spent_tokens").asLong());
    assertFalse(new EvaluationSpendBudget("0.479999", "8").canStartCase());
  }

  @Test
  void unknownUsageKeepsFullReservationInsteadOfCountingFailedCallsAsFree() {
    var budget = new EvaluationSpendBudget("0.48", "8");
    budget.record(json.createObjectNode().put("tokens", 10).put("usage_complete", false));
    assertFalse(budget.canStartCase());
    var report = budget.report(json, 2);
    assertEquals(60000, report.path("reserved_or_reported_tokens").asLong());
    assertEquals(1, report.path("unknown_usage_cases").asInt());
    assertEquals(0.48, report.path("estimated_cny").asDouble());
  }

  @Test
  void invalidNonfiniteZeroAndNegativeSettingsFailBeforeCalls() {
    for (String value : new String[] {"NaN", "Infinity", "-1", "0", "bad", "1e999"}) {
      assertThrows(IllegalArgumentException.class, () -> new EvaluationSpendBudget(value, "8"));
      assertThrows(IllegalArgumentException.class, () -> new EvaluationSpendBudget("6", value));
    }
  }
}
