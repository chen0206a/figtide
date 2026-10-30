package dev.labflow.review;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.*;
import java.net.URI;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;

class JournalRulesTest {
  @Test void verifiedTableHasBoundedUniqueFactsAndMatchingFrontendSnapshot() throws Exception {
    var json = new ObjectMapper();
    var rules = new JournalRules(json).all();
    assertTrue(rules.size() >= 6 && rules.size() <= 9);
    Set<String> ids = new HashSet<>();
    for (var rule : rules) {
      assertTrue(ids.add(rule.path("id").asText()));
      if (!rule.path("id").asText().equals("default"))
        assertEquals("https", URI.create(rule.path("source_url").asText()).getScheme());
      assertFalse(LocalDate.parse(rule.path("checked_at").asText()).isAfter(LocalDate.now()));
      for (String field : List.of("single_column_mm", "double_column_mm", "min_font_pt", "max_font_pt")) {
        var n = rule.get(field);
        assertNotNull(n);
        if (!n.isNull()) {
          double min = field.endsWith("mm") ? 40 : 4, max = field.endsWith("mm") ? 200 : 12;
          assertTrue(n.isNumber() && n.asDouble() >= min && n.asDouble() <= max, field);
        }
      }
    }
    var frontend = Path.of("../frontend/src/editor/journal-rules-v1.json");
    assertEquals(rules, json.readTree(Files.readString(frontend)), "期刊规则的离线前端快照必须一致");
  }
}
