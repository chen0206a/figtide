package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.labflow.api.ApiException;
import dev.labflow.service.ConfigValidator;
import org.junit.jupiter.api.Test;

class ConfigValidatorTest {
  private ObjectNode fixture() throws Exception {
    return (ObjectNode)
        new ObjectMapper().readTree(getClass().getResourceAsStream("/config-v1.json"));
  }

  @Test
  void completeContractAccepted() throws Exception {
    assertDoesNotThrow(() -> ConfigValidator.validate(fixture()));
  }

  @Test
  void incompleteConfigRejected() throws Exception {
    var c = fixture();
    c.remove("axes");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
  }

  @Test
  void styleBoundsAndColorRejected() throws Exception {
    var c = fixture();
    ((ObjectNode) c.path("style")).put("fontSize", 1000);
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    var d = fixture();
    ((ObjectNode) d.path("series").get(0)).put("color", "url(https://example.com)");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(d));
  }

  @Test
  void duplicateSeriesRejected() throws Exception {
    var c = fixture();
    ((com.fasterxml.jackson.databind.node.ArrayNode) c.path("series"))
        .add(c.path("series").get(0).deepCopy());
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
  }
}
