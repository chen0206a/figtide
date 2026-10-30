package dev.labflow.eval;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;

/** Serial case reservations shared by both opt-in live entry points. Not a billing receipt. */
final class EvaluationSpendBudget {
  static final int CASE_TOKENS = 60000;
  private final BigDecimal ceiling, price;
  private long charged, reported;
  private int unknownUsage;

  EvaluationSpendBudget(String ceiling, String price) {
    this(ceiling, price, false);
  }

  private EvaluationSpendBudget(String ceiling, String price, boolean unlimited) {
    this.ceiling = unlimited ? null : positive(ceiling);
    this.price = positive(price);
  }

  static EvaluationSpendBudget unlimited(String price) {
    return new EvaluationSpendBudget(null, price, true);
  }

  static EvaluationSpendBudget configured() {
    return new EvaluationSpendBudget(
        System.getProperty("labflow.eval.maxCostCny", "6"),
        System.getProperty("labflow.eval.pricePerMillionCny", "8"),
        Boolean.getBoolean("labflow.eval.unlimitedCost"));
  }

  private static BigDecimal positive(String value) {
    try {
      var number = new BigDecimal(value);
      if (number.signum() > 0 && Math.abs((long) number.scale()) <= 12 && number.precision() <= 18)
        return number;
    } catch (NumberFormatException ignored) {
    }
    throw new IllegalArgumentException(
        "Evaluation ceiling and token price must be finite positive decimals");
  }

  private BigDecimal estimate(long tokens) {
    return price.multiply(BigDecimal.valueOf(tokens)).movePointLeft(6);
  }

  boolean canStartCase() {
    return ceiling == null || estimate(charged + CASE_TOKENS).compareTo(ceiling) <= 0;
  }
  boolean canStartPair() {
    return ceiling == null || estimate(charged + 2L * CASE_TOKENS).compareTo(ceiling) <= 0;
  }

  void record(JsonNode row) {
    long tokens = Math.max(0, row.path("tokens").asLong());
    reported += tokens;
    if (row.path("usage_complete").asBoolean()) charged += tokens;
    else {
      // A transport/audit error must not turn an unreported paid call into zero spend.
      charged += Math.max(CASE_TOKENS, tokens);
      unknownUsage++;
    }
  }

  ObjectNode report(ObjectMapper json, int skipped) {
    var result = json.createObjectNode()
        .put("ceiling_cny", ceiling)
        .put("cost_limit_enabled", ceiling != null)
        .put("worst_case_price_per_million_cny", price)
        .put("spent_tokens", reported)
        .put("reserved_or_reported_tokens", charged)
        .put("estimated_cny", estimate(charged))
        .put("case_reservation_tokens", CASE_TOKENS)
        .put("unknown_usage_cases", unknownUsage)
        .put("skipped_cases", skipped)
        .put(
            "note",
            (ceiling == null ? "Owner explicitly disabled the total estimated cost limit; usage is still recorded. " : "")
                + "Before each live case account for 60000 tokens at the configured price; unknown usage"
                + " retains the reservation. Estimate only, not verified provider pricing or a"
                + " billing guarantee.");
    if(Boolean.getBoolean("labflow.team.unbounded")&&unknownUsage>0){result.putNull("estimated_cny").put("estimate_incomplete",true).put("note","Unrestricted evaluation has unknown usage with no known upper bound. Nominal reservations are bookkeeping, not a spending bound; only reported tokens are measured.");}
    return result;
  }
}
