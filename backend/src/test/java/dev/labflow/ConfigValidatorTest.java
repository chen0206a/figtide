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

  private ObjectNode professional() throws Exception {
    var c = fixture();
    c.put("type", "violin");
    c.set(
        "distribution",
        new ObjectMapper()
            .readTree(
                """
{"points":"all","quartileMethod":"exclusive","mean":true,"innerBox":true,"bandwidth":"0.3","span":"hard"}
"""));
    c.set(
        "facet",
        new ObjectMapper()
            .readTree(
                """
{"mode":"series","field":"","columns":2,"gapX":90,"gapY":100,"shareX":true,"shareY":false,"labels":true,"titles":{"series:s1":"Accuracy"}}
"""));
    return c;
  }

  @Test
  void professionalContractAndLegacyConfigAccepted() throws Exception {
    assertDoesNotThrow(() -> ConfigValidator.validate(professional()));
    var box = professional().put("type", "box");
    assertDoesNotThrow(() -> ConfigValidator.validate(box));
    assertDoesNotThrow(() -> ConfigValidator.validate(fixture()));
  }

  @Test
  void invalidDensityBandwidthAndMethodRejected() throws Exception {
    for (String invalid : new String[] {"0", "-1", "NaN", "Infinity", "1e999", "text"}) {
      var c = professional();
      ((ObjectNode) c.path("distribution")).put("bandwidth", invalid);
      assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    }
    var c = professional();
    ((ObjectNode) c.path("distribution")).put("quartileMethod", "fabricated");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
  }

  @Test
  void malformedFacetsRejected() throws Exception {
    var c = professional();
    ((ObjectNode) c.path("facet")).put("columns", 2.5);
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    var malformed = professional();
    ((ObjectNode) malformed.path("facet")).put("shareX", "yes");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(malformed));
    var invalidType = fixture().put("type", "unknown");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(invalidType));
  }
}
