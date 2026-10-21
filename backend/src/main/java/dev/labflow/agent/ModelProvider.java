package dev.labflow.agent;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Duration;

/** Transport only. No workspace access, tools, persistence or application of proposals. */
public interface ModelProvider {
  record Info(boolean available, String model, String endpoint, String reason) {}

  record Reply(
      ObjectNode message,
      int promptTokens,
      int completionTokens,
      String model,
      String finishReason) {}

  Info info();

  Reply complete(ArrayNode messages, ArrayNode tools, int maxOutputTokens, Duration timeout)
      throws Exception;
}
