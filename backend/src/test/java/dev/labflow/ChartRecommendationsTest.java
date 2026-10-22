package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.ChartRecommendations;
import dev.labflow.api.ApiException;
import org.junit.jupiter.api.Test;

class ChartRecommendationsTest {
  final ObjectMapper json = new ObjectMapper();

  JsonNode profile() throws Exception {
    return json.readTree(
        "{\"fields\":[{\"name\":\"epoch\",\"type\":\"number\",\"unique\":3},{\"name\":\"accuracy\",\"type\":\"number\",\"unique\":3},{\"name\":\"model\",\"type\":\"string\",\"unique\":2}]}");
  }

  ObjectNode plan() throws Exception {
    return (ObjectNode)
        json.readTree(
            "{\"charts\":[{\"type\":\"line\",\"x\":\"epoch\",\"ys\":[\"accuracy\"],\"group\":\"model\",\"heatY\":\"\",\"heatZ\":\"\",\"title\":\"趋势\",\"reason\":\"比较变化\",\"caveat\":\"不自动排序\"}]}");
  }

  @Test
  void validatesRealMappingAndRejectsInventedFieldsAndErrors() throws Exception {
    var args = plan();
    var profile = profile();
    assertEquals("plan-1", ChartRecommendations.validate(args, profile).get(0).path("id").asText());
    ((ArrayNode) args.at("/charts/0/ys")).set(0, new TextNode("fabricated"));
    assertThrows(ApiException.class, () -> ChartRecommendations.validate(args, profile));
    var extra = plan();
    ((ObjectNode) extra.at("/charts/0")).put("error", "invented");
    assertThrows(ApiException.class, () -> ChartRecommendations.validate(extra, profile));
  }

  @Test
  void rejectsNonNumericScatterAndRepeatedTypes() throws Exception {
    var args = plan();
    var profile = profile();
    ((ObjectNode) args.at("/charts/0")).put("type", "scatter").put("x", "model");
    assertThrows(ApiException.class, () -> ChartRecommendations.validate(args, profile));
    var duplicate = plan();
    ((ArrayNode) duplicate.path("charts")).add(duplicate.at("/charts/0").deepCopy());
    assertThrows(ApiException.class, () -> ChartRecommendations.validate(duplicate, profile));
  }
}
