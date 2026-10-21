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
    this.ceiling = positive(ceiling);
    this.price = positive(price);
  }

  static EvaluationSpendBudget configured() {
    return new EvaluationSpendBudget(
        System.getProperty("labflow.eval.maxCostCny", "6"),
        System.getProperty("labflow.eval.pricePerMillionCny", "8"));
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
    return estimate(charged + CASE_TOKENS).compareTo(ceiling) <= 0;
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
    return json.createObjectNode()
        .put("ceiling_cny", ceiling)
        .put("worst_case_price_per_million_cny", price)
        .put("spent_tokens", reported)
        .put("reserved_or_reported_tokens", charged)
        .put("estimated_cny", estimate(charged))
        .put("case_reservation_tokens", CASE_TOKENS)
        .put("unknown_usage_cases", unknownUsage)
        .put("skipped_cases", skipped)
        .put(
            "note",
            "Before each live case reserve 60000 tokens at the configured price; unknown usage"
                + " retains the reservation. Estimate only, not verified provider pricing or a"
                + " billing guarantee.");
  }
}
