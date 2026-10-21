package dev.labflow.eval;

import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.ModelProvider;
import java.time.Duration;

/** Test-scope only. Scripts are authored fixtures, never presented as real model recordings. */
final class ReplayProvider implements ModelProvider {
  private final ArrayNode turns;
  private int next;

  ReplayProvider(ArrayNode turns) {
    this.turns = turns.deepCopy();
  }

  public Info info() {
    return new Info(true, "authored-replay-v1", "offline://fixture", "");
  }

  public Reply complete(
      ArrayNode messages, ArrayNode tools, int maxOutputTokens, Duration timeout) {
    if (next >= turns.size()) throw new IllegalStateException("Replay exhausted");
    var turn = turns.get(next++);
    return new Reply(
        ((ObjectNode) turn.path("message")).deepCopy(),
        turn.path("prompt_tokens").asInt(),
        turn.path("completion_tokens").asInt(),
        info().model(),
        turn.path("finish_reason").asText());
  }
}
