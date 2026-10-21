package dev.labflow.agent;

import com.fasterxml.jackson.databind.node.*;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class ConfigurableModelProvider implements ModelProvider {
  private final ModelConnections connections;

  public ConfigurableModelProvider(ModelConnections connections) {
    this.connections = connections;
  }

  public Info info() {
    return snapshot().info();
  }

  public ModelProvider snapshot() {
    return connections.snapshot();
  }

  public String redactSecret(String text) {
    return snapshot().redactSecret(text);
  }

  public Reply complete(ArrayNode messages, ArrayNode tools, int max, Duration timeout)
      throws Exception {
    return snapshot().complete(messages, tools, max, timeout);
  }
}
