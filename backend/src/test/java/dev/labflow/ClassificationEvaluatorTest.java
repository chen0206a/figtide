package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.labflow.api.ApiException;
import dev.labflow.evaluation.ClassificationEvaluator;
import java.util.*;
import org.junit.jupiter.api.Test;

class ClassificationEvaluatorTest {
  final ObjectMapper json = new ObjectMapper();

  ObjectNode config() throws Exception {
    return (ObjectNode)
        json.readTree(
            """
{"datasetVersionId":1,"type":"confusion","group":"","transforms":[],"sampling":{"policy":"independent","id":"id"},"classification":{"algorithm":"classification-v1","label":"truth","input":"labels","classes":["A","B","C"],"positive":"1","threshold":0.5,"normalization":"count","seriesId":"","groupValue":"","xTitle":"","yTitle":""},"series":[{"id":"a","name":"Model A","prediction":"a","visible":true},{"id":"b","name":"Model B","prediction":"b","visible":true}]}
""");
  }

  List<Map<String, Object>> rows() {
    var result = new ArrayList<Map<String, Object>>();
    String[][] values = {
      {"A", "A", "A"},
      {"A", "B", null},
      {"B", "B", "C"},
      {"B", "C", "B"},
      {"C", "C", "C"},
      {"C", "C", "A"},
      {"C", null, "C"},
      {null, "A", "A"},
      {"A", null, "B"}
    };
    for (int i = 0; i < values.length; i++) {
      var r = new LinkedHashMap<String, Object>();
      r.put("id", i + 1);
      r.put("truth", values[i][0]);
      r.put("a", values[i][1]);
      r.put("b", values[i][2]);
      result.add(r);
    }
    return result;
  }

  JsonNode evaluate(ObjectNode c, List<Map<String, Object>> rows) {
    return json.valueToTree(ClassificationEvaluator.evaluate(c, rows));
  }

  @Test
  void countsAndClassMetricsMatchHandCalculation() throws Exception {
    var data = rows();
    var before = json.valueToTree(data);
    var r = evaluate(config(), data).path("reports").get(0);
    assertEquals(json.readTree("[[1,1,0],[0,1,1],[0,0,2]]"), r.path("counts"));
    assertEquals(6, r.path("n").asInt());
    assertEquals(2.0 / 3, r.path("accuracy").asDouble());
    assertEquals((2.0 / 3 + 0.5 + 0.8) / 3, r.path("macro").path("f1").asDouble());
    assertEquals(json.readTree("[1,2,3,4,5,6]"), r.path("sampleRows"));
    assertEquals(before, json.valueToTree(data));
  }

  @Test
  void commonRowsUseEveryVisibleModel() throws Exception {
    var c = config();
    ((ObjectNode) c.path("sampling")).put("policy", "intersection");
    var r = evaluate(c, rows()).path("reports");
    assertEquals(5, r.get(0).path("n").asInt());
    assertEquals(5, r.get(1).path("n").asInt());
    assertEquals(1, r.get(0).path("excludedByOthers").asInt());
    assertEquals(2, r.get(1).path("excludedByOthers").asInt());
    assertEquals(r.get(0).path("sampleRows"), r.get(1).path("sampleRows"));
  }

  @Test
  void normalizationNeverChangesRawCountsAndZeroDenominatorsStayNull() throws Exception {
    var c = config();
    ((com.fasterxml.jackson.databind.node.ArrayNode) c.path("classification").path("classes"))
        .add("D");
    ((ObjectNode) c.path("classification")).put("normalization", "true");
    var r = evaluate(c, rows()).path("reports").get(0);
    assertEquals(0.5, r.path("matrix").get(0).get(0).asDouble());
    assertTrue(r.path("matrix").get(3).get(0).isNull());
    assertTrue(r.path("macro").path("f1").isNull());
    assertNotNull(r.path("weighted").path("f1").numberValue());
    ((ObjectNode) c.path("classification")).put("normalization", "pred");
    assertEquals(
        1, evaluate(c, rows()).path("reports").get(0).path("matrix").get(0).get(0).asDouble());
  }

  @Test
  void unknownCategoriesAndDuplicateIdsAreRejected() throws Exception {
    var c = config();
    var rows = rows();
    rows.getFirst().put("a", "unknown");
    assertThrows(ApiException.class, () -> evaluate(c, rows));
    var duplicate = rows();
    duplicate.getFirst().put("id", 2);
    assertThrows(ApiException.class, () -> evaluate(c, duplicate));
  }

  @Test
  void binaryScoreThresholdsUseGreaterThanOrEqual() throws Exception {
    var c = config();
    var k = (ObjectNode) c.path("classification");
    k.put("input", "scores").put("positive", "1");
    k.putArray("classes").add("0").add("1");
    var s = (ObjectNode) c.path("series").get(0);
    s.put("y", "score");
    ((ObjectNode) c.path("series").get(1)).put("visible", false);
    var r = new ArrayList<Map<String, Object>>();
    double[] scores = {.1, .4, .35, .8};
    for (int i = 0; i < 4; i++)
      r.add(Map.of("id", i + 1, "truth", i < 2 ? 0 : 1, "score", scores[i]));
    assertEquals(
        json.readTree("[[2,0],[1,1]]"), evaluate(c, r).path("reports").get(0).path("counts"));
  }

  @Test
  void weightedAndMicroScoresUseActualSupport() {
    var r =
        json.valueToTree(
            ClassificationEvaluator.metrics(new int[][] {{3, 1}, {0, 1}}, List.of("A", "B")));
    assertEquals(.8, r.path("micro").path("f1").asDouble());
    assertEquals((4 * (6.0 / 7) + 2.0 / 3) / 5, r.path("weighted").path("f1").asDouble(), 1e-15);
  }
}
