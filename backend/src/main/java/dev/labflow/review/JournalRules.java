package dev.labflow.review;

import com.fasterxml.jackson.databind.*;
import dev.labflow.api.ApiException;
import java.io.IOException;
import org.springframework.stereotype.Component;

/** Versioned numerical facts only; unknown requirements remain null. */
@Component
public class JournalRules {
  private final JsonNode rules;

  public JournalRules(ObjectMapper json) {
    try (var in = getClass().getResourceAsStream("/review/journal-rules-v1.json")) {
      rules = json.readTree(in);
    } catch (IOException e) {
      throw new IllegalStateException("期刊规则表不可读", e);
    }
  }

  public JsonNode all() { return rules.deepCopy(); }

  public JsonNode get(String id) {
    for (var rule : rules) if (rule.path("id").asText().equals(id)) return rule.deepCopy();
    throw ApiException.bad("不支持的目标期刊");
  }
}
