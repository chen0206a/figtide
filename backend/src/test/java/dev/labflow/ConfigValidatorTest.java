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
  void evaluationAlgorithmAndActualBandContractValidated() throws Exception {
    var c = fixture().put("type", "roc");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    var e =
        new ObjectMapper()
            .readTree(
                """
{"algorithm":"binary-ranking-v1","missing":"exclude","label":"label","positive":"1","threshold":0.5,"baseline":true,"rocXTitle":"","rocYTitle":"","prXTitle":"","prYTitle":""}
""");
    c.set("evaluation", e);
    assertDoesNotThrow(() -> ConfigValidator.validate(c));
    // Optional legend metric switch (2026-10): absent, boolean ok; anything else rejected.
    ((ObjectNode) e).put("legendMetric", true);
    assertDoesNotThrow(() -> ConfigValidator.validate(c));
    ((ObjectNode) e).put("legendMetric", false);
    assertDoesNotThrow(() -> ConfigValidator.validate(c));
    for (String invalid : new String[] {"\"yes\"", "1", "null", "[]", "{}"}) {
      ((ObjectNode) e).set("legendMetric", new ObjectMapper().readTree(invalid));
      assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    }
    ((ObjectNode) e).remove("legendMetric");
    ((ObjectNode) e).put("algorithm", "unknown");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    ((ObjectNode) e).put("algorithm", "binary-ranking-v1").put("threshold", "NaN");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    c.remove("evaluation");
    c.put("type", "line");
    var b = ((ObjectNode) c.path("series").get(0)).putObject("band");
    b.put("enabled", true)
        .put("lower", "lower")
        .put("upper", "upper")
        .put("opacity", 0.18)
        .put("label", "Actual bounds");
    assertDoesNotThrow(() -> ConfigValidator.validate(c));
    b.put("opacity", 2);
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
  }

  @Test
  void publicationAndEmpiricalOptionsValidated() throws Exception {
    var c = fixture().put("type", "histogram");
    c.set(
        "publication",
        new ObjectMapper().readTree("{\"enabled\":true,\"widthMm\":89,\"fontPt\":7,\"dpi\":300}"));
    c.set(
        "empirical",
        new ObjectMapper()
            .readTree(
                "{\"bins\":20,\"start\":\"0\",\"end\":\"10\",\"normalization\":\"density\",\"valueTitle\":\"Score\",\"resultTitle\":\"Density\"}"));
    assertDoesNotThrow(() -> ConfigValidator.validate(c));
    ((ObjectNode) c.path("publication")).put("dpi", 0);
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    ((ObjectNode) c.path("publication")).put("dpi", 300);
    ((ObjectNode) c.path("empirical")).put("bins", 1.5);
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    ((ObjectNode) c.path("empirical")).put("bins", 20).put("start", "Infinity");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
  }

  @Test
  void heatmapScaleOptionsValidated() throws Exception {
    var c = fixture().put("type", "heatmap");
    c.set(
        "heatmap",
        new ObjectMapper()
            .readTree(
                "{\"palette\":\"blueRed\",\"min\":\"-1\",\"max\":\"1\",\"center\":\"0\",\"labels\":true}"));
    assertDoesNotThrow(() -> ConfigValidator.validate(c));
    ((ObjectNode) c.path("heatmap")).put("center", "2");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
    ((ObjectNode) c.path("heatmap")).put("center", "0").put("palette", "rainbow-unsupported");
    assertThrows(ApiException.class, () -> ConfigValidator.validate(c));
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
