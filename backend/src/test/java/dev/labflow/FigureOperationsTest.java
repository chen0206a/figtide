package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.service.FigureOperations;
import java.util.Set;
import org.junit.jupiter.api.Test;

class FigureOperationsTest {
  @Test
  void specializedAxisLabelsUseDisplayFieldsAndFixedAxesRejectIneffectiveSettings()
      throws Exception {
    var roc = config();
    roc.put("type", "roc");
    roc.set(
        "evaluation",
        json.readTree(
            """
{"algorithm":"binary-ranking-v1","missing":"exclude","label":"truth","positive":"1","threshold":0.5,"baseline":true,"rocXTitle":"","rocYTitle":"","prXTitle":"","prYTitle":""}
"""));
    var result =
        FigureOperations.apply(
            roc,
            operations(
                "[{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"x\",\"title\":\"False alarm"
                    + " rate\"}}]"));
    assertEquals("False alarm rate", result.path("evaluation").path("rocXTitle").asText());
    assertEquals(
        roc.path("evaluation").path("positive"), result.path("evaluation").path("positive"));
    assertEquals(roc.path("axes"), result.path("axes"));
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                roc,
                operations(
                    "[{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"x\",\"min\":0.1}}]")));
    var hist = config();
    hist.put("type", "histogram");
    hist.set(
        "empirical",
        json.readTree(
            "{\"bins\":20,\"start\":\"\",\"end\":\"\",\"normalization\":\"count\",\"valueTitle\":\"\",\"resultTitle\":\"\"}"));
    var histogram =
        FigureOperations.apply(
            hist,
            operations(
                "[{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"y\",\"title\":\"Frequency\"}}]"));
    assertEquals("Frequency", histogram.path("empirical").path("resultTitle").asText());
    assertEquals(20, histogram.path("empirical").path("bins").asInt());
  }

  @Test
  void matrixAndCategoricalOperationsNeverSilentlyChangeDormantSettings() throws Exception {
    var matrix = config();
    matrix.put("type", "heatmap");
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                matrix, operations("[{\"tool\":\"set_legend\",\"arguments\":{\"show\":false}}]")));
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                matrix,
                operations(
                    "[{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"x\",\"grid\":true}}]")));
    var violin = config();
    violin.put("type", "violin");
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                violin,
                operations(
                    "[{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"x\",\"log\":true}}]")));
    var result =
        FigureOperations.apply(
            violin,
            operations(
                "[{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"y\",\"min\":0,\"max\":1}}]"));
    assertEquals("1", result.path("axes").path("y").path("max").asText());
  }

  final ObjectMapper json = new ObjectMapper();

  ObjectNode config() throws Exception {
    return (ObjectNode) json.readTree(getClass().getResourceAsStream("/config-v1.json"));
  }

  JsonNode operations(String text) throws Exception {
    return json.readTree(text);
  }

  @Test
  void catalogDeclaresOnlyExplicitPreviewTools() {
    var catalog = FigureOperations.catalog();
    assertEquals(1, catalog.path("protocol_version").asInt());
    assertEquals("preview-only", catalog.path("execution").asText());
    assertEquals(10, catalog.path("tools").size());
    assertEquals(2, catalog.path("categories").size());
    assertEquals("presentation", catalog.path("categories").get(0).path("id").asText());
    assertEquals("结构", catalog.path("categories").get(1).path("label").asText());
    int structure = 0;
    for (var tool : catalog.path("tools")) {
      assertFalse(tool.path("input_schema").path("additionalProperties").asBoolean());
      assertTrue(Set.of("presentation", "structure").contains(tool.path("category").asText()));
      if (tool.path("category").asText().equals("structure")) structure++;
    }
    assertEquals(5, structure);
    var readTools = catalog.path("read_tools");
    assertEquals(3, readTools.size());
    assertEquals("get_figure_spec", readTools.get(0).path("name").asText());
    assertEquals("lint_figure", readTools.get(1).path("name").asText());
    assertEquals("GET", readTools.get(0).path("method").asText());
    assertEquals("/api/projects/{project}/figure-tools/lint", readTools.get(1).path("endpoint").asText());
    for (var tool : readTools) assertEquals("read", tool.path("category").asText());
  }

  @Test
  void structuralToolsMoveBindingsAndSeriesWithoutTouchingAppearance() throws Exception {
    var c = config();
    var result =
        FigureOperations.apply(
            c,
            operations(
                """
                [{"tool":"set_chart","arguments":{"type":"bar"}},
                 {"tool":"set_mapping","arguments":{"x":"accuracy","group":"0"}},
                 {"tool":"map_series","arguments":{"seriesId":"s1","y":"epoch","error":""}},
                 {"tool":"add_series","arguments":{"id":"s2","y":"error"}}]
                """));
    assertEquals("bar", result.path("type").asText());
    assertEquals("accuracy", result.path("x").asText());
    assertEquals("0", result.path("group").asText());
    assertEquals("epoch", result.path("series").get(0).path("y").asText());
    assertEquals("", result.path("series").get(0).path("error").asText());
    assertEquals("s2", result.path("series").get(1).path("id").asText());
    assertEquals("error", result.path("series").get(1).path("y").asText());
    assertEquals(c.path("series").get(0).path("color"), result.path("series").get(1).path("color"));
    assertEquals(c.path("series").get(0).path("color"), result.path("series").get(0).path("color"));
    assertEquals(4, FigureOperations.changes(c, result).size());
    var removed =
        FigureOperations.apply(
            result, operations("[{\"tool\":\"remove_series\",\"arguments\":{\"seriesId\":\"s2\"}}]"));
    assertEquals(1, removed.path("series").size());
    assertEquals("s1", removed.path("series").get(0).path("id").asText());
  }

  @Test
  void structuralToolsRejectDanglingBindingsInsteadOfGuessing() throws Exception {
    var c = config();
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                c, operations("[{\"tool\":\"remove_series\",\"arguments\":{\"seriesId\":\"s1\"}}]")));
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                c,
                operations(
                    "[{\"tool\":\"add_series\",\"arguments\":{\"id\":\"s1\",\"y\":\"accuracy\"}}]")));
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                c, operations("[{\"tool\":\"set_chart\",\"arguments\":{\"type\":\"roc\"}}]")));
    var noHeat = config();
    noHeat.put("heatY", "").put("heatZ", "");
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                noHeat, operations("[{\"tool\":\"set_chart\",\"arguments\":{\"type\":\"heatmap\"}}]")));
    var roc = config();
    roc.put("type", "roc");
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                roc, operations("[{\"tool\":\"set_mapping\",\"arguments\":{\"x\":\"accuracy\"}}]")));
    var referenced = config();
    var classification = referenced.putObject("classification");
    classification
        .put("algorithm", "classification-v1")
        .put("label", "accuracy")
        .put("positive", "")
        .put("input", "labels")
        .put("normalization", "count")
        .put("threshold", 0.5)
        .put("xTitle", "")
        .put("yTitle", "")
        .put("seriesId", "s1")
        .put("groupValue", "");
    classification.putArray("classes");
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                referenced,
                operations("[{\"tool\":\"remove_series\",\"arguments\":{\"seriesId\":\"s1\"}}]")));
  }

  @Test
  void batchPreservesEveryUnrelatedFieldAndOriginalSnapshot() throws Exception {
    var c = config();
    c.putObject("future_extension").put("unknown", "retained");
    var before = c.deepCopy();
    var result =
        FigureOperations.apply(
            c,
            operations(
                """
                [{"tool":"set_style","arguments":{"title":"模型 α","fontSize":18}},
                 {"tool":"set_axis","arguments":{"axis":"y","min":0.5,"max":1,"grid":false}},
                 {"tool":"set_legend","arguments":{"position":"bottom","orientation":"h"}},
                 {"tool":"set_canvas","arguments":{"width":1000}}]
                """));
    assertEquals(before, c);
    assertEquals(c.get("series"), result.get("series"));
    for (String key :
        new String[] {
          "datasetVersionId", "x", "group", "type", "transforms", "annotations", "future_extension"
        }) assertEquals(c.get(key), result.get(key));
    assertEquals("0.5", result.path("axes").path("y").path("min").asText());
    assertEquals(1000, result.path("style").path("width").asInt());
    assertTrue(FigureOperations.changes(c, result).toString().contains("/axes/y/grid"));
    assertEquals(18, result.path("style").path("fontSize").asInt());
  }

  @Test
  void unsupportedPathsCodeAndBindingChangesAreRejectedAtomically() throws Exception {
    for (String op :
        new String[] {
          "{\"tool\":\"execute_python\",\"arguments\":{\"code\":\"print(1)\"}}",
          "{\"tool\":\"set_style\",\"arguments\":{\"datasetVersionId\":99}}",
          "{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"y\",\"__proto__\":{}}}",
          "{\"tool\":\"set_series\",\"arguments\":{\"seriesId\":\"missing\",\"y\":\"fake\"}}",
          "{\"tool\":\"set_style\",\"arguments\":{\"fontSize\":\"18\"}}",
          "{\"tool\":\"set_style\",\"arguments\":{\"fontSize\":null}}",
          "{\"tool\":\"set_style\",\"arguments\":{}}"
        }) {
      var c = config();
      var before = c.deepCopy();
      assertThrows(
          ApiException.class,
          () ->
              FigureOperations.apply(
                  c,
                  operations(
                      "[{\"tool\":\"set_style\",\"arguments\":{\"fontSize\":20}}," + op + "]")));
      assertEquals(before, c);
    }
  }

  @Test
  void rangesLogScaleAndMarginsFailRatherThanSilentlyFallingBack() throws Exception {
    for (String op :
        new String[] {
          "{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"y\",\"min\":10,\"max\":1}}",
          "{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"x\",\"min\":0,\"log\":true}}",
          "{\"tool\":\"set_axis\",\"arguments\":{\"axis\":\"x\",\"dtick\":0}}",
          "{\"tool\":\"set_canvas\",\"arguments\":{\"width\":250,\"left\":200,\"right\":100}}",
          "{\"tool\":\"set_canvas\",\"arguments\":{\"width\":700.5}}"
        })
      assertThrows(
          ApiException.class, () -> FigureOperations.apply(config(), operations("[" + op + "]")));
  }

  @Test
  void nullRangeClearsAutoAndSeriesIdTargetsOnlyAppearance() throws Exception {
    var c = config();
    String id = c.path("series").get(0).path("id").asText();
    var args =
        json.createObjectNode().put("seriesId", id).put("color", "#0072b2").put("symbol", "square");
    var ops = json.createArrayNode();
    ops.addObject().put("tool", "set_series").set("arguments", args);
    ops.addObject()
        .put("tool", "set_axis")
        .set("arguments", json.createObjectNode().put("axis", "y").putNull("min").putNull("max"));
    var result = FigureOperations.apply(c, ops);
    assertEquals(c.path("series").get(0).path("y"), result.path("series").get(0).path("y"));
    assertEquals("#0072b2", result.path("series").get(0).path("color").asText());
    assertEquals("", result.path("axes").path("y").path("min").asText());
    ((ObjectNode) args).put("seriesId", "missing");
    assertThrows(ApiException.class, () -> FigureOperations.apply(c, ops));
  }

  @Test
  void physicalTypographyRequiresPtAndRetainsOutputSettings() throws Exception {
    var c = config();
    c.putObject("publication")
        .put("enabled", true)
        .put("widthMm", 89)
        .put("fontPt", 8)
        .put("dpi", 300);
    assertThrows(
        ApiException.class,
        () ->
            FigureOperations.apply(
                c, operations("[{\"tool\":\"set_style\",\"arguments\":{\"fontSize\":18}}]")));
    var result =
        FigureOperations.apply(
            c, operations("[{\"tool\":\"set_style\",\"arguments\":{\"fontPt\":9}}]"));
    assertEquals(9, result.path("publication").path("fontPt").asInt());
    assertEquals(89, result.path("publication").path("widthMm").asInt());
    assertEquals(c.path("style"), result.path("style"));
  }
}
