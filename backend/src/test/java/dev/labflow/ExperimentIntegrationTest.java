package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties =
        "spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_test?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC")
@AutoConfigureMockMvc
class ExperimentIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  JsonNode postJson(String path, JsonNode body) throws Exception {
    return json.readTree(
        mvc.perform(post(path).contentType("application/json").content(body.toString()))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  String project() throws Exception {
    return "/api/projects/"
        + postJson(
                "/api/projects",
                json.createObjectNode().put("name", "实验对比集成验收").put("description", "合成数据"))
            .path("id")
            .asLong();
  }

  ObjectNode input(String name, double value) {
    var n =
        json.createObjectNode()
            .put("name", name)
            .put("notes", "synthetic")
            .put("status", "completed");
    n.putObject("parameters").put("seed", 42);
    n.putObject("metrics").put("accuracy", value);
    n.putArray("tags").add("demo");
    n.putArray("dataset_version_ids");
    return n;
  }

  ObjectNode selection(JsonNode a, JsonNode b) {
    var n =
        json.createObjectNode()
            .put("baseline_id", a.path("id").asLong())
            .put("metric", "accuracy")
            .put("direction", "higher")
            .put("chart_type", "bar");
    n.putArray("experiments")
        .addObject()
        .put("id", a.path("id").asLong())
        .put("revision", a.path("revision").asInt());
    ((com.fasterxml.jackson.databind.node.ArrayNode) n.get("experiments"))
        .addObject()
        .put("id", b.path("id").asLong())
        .put("revision", b.path("revision").asInt());
    return n;
  }

  @Test
  void linkedVersionsAndImmutableComparisonSurviveExperimentEdits() throws Exception {
    String p = project();
    var data =
        json.readTree(
            mvc.perform(
                    multipart(p + "/datasets")
                        .file(
                            new MockMultipartFile(
                                "file", "result.csv", "text/csv", "epoch,score\n1,90".getBytes())))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    var body = input("baseline", 90);
    body.withArray("dataset_version_ids").add(data.path("id").asLong());
    var a = postJson(p + "/experiments", body);
    var b = postJson(p + "/experiments", input("proposed", 95));
    assertEquals(data.path("sha256"), a.path("datasets").get(0).path("sha256"));
    var snapshot = postJson(p + "/comparisons", selection(a, b));
    assertEquals(90, snapshot.path("rows").get(0).path("metric_value").asDouble());
    assertEquals(2, snapshot.path("source_meta").path("experiments").size());
    body.put("revision", 1);
    ((ObjectNode) body.get("metrics")).put("accuracy", 10);
    mvc.perform(
            put(p + "/experiments/" + a.path("id").asLong())
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(2));
    var reread =
        json.readTree(
            mvc.perform(get(p + "/data/" + snapshot.path("id").asLong()))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(snapshot.path("rows"), reread.path("rows"));
    assertEquals(snapshot.path("source_meta"), reread.path("source_meta"));
    assertEquals(snapshot.path("sha256"), reread.path("sha256"));
    mvc.perform(
            post(p + "/comparisons")
                .contentType("application/json")
                .content(selection(a, b).toString()))
        .andExpect(status().isConflict());
    mvc.perform(
            put(p + "/experiments/" + a.path("id").asLong())
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isConflict());
    mvc.perform(get(p + "/datasets")).andExpect(jsonPath("$.length()").value(2));
  }

  @Test
  void rejectsCrossProjectLinksAndSelectionsWithoutPartialWrites() throws Exception {
    String p = project(), other = project();
    var data =
        json.readTree(
            mvc.perform(
                    multipart(other + "/datasets")
                        .file(
                            new MockMultipartFile(
                                "file", "x.csv", "text/csv", "x,y\n1,2".getBytes())))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    var body = input("bad link", 2);
    body.withArray("dataset_version_ids").add(data.path("id").asLong());
    mvc.perform(post(p + "/experiments").contentType("application/json").content(body.toString()))
        .andExpect(status().isNotFound());
    mvc.perform(get(p + "/experiments")).andExpect(jsonPath("$.length()").value(0));
    var a = postJson(p + "/experiments", input("one", 1));
    var b = postJson(other + "/experiments", input("other", 2));
    mvc.perform(
            post(p + "/comparisons")
                .contentType("application/json")
                .content(selection(a, b).toString()))
        .andExpect(status().isNotFound());
    mvc.perform(get(p + "/datasets")).andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void legacyUpdatesPreserveMetadataAndTextMetricsStayMissing() throws Exception {
    String p = project();
    var body = input("old compatible", 90);
    var a = postJson(p + "/experiments", body);
    body.remove(java.util.List.of("status", "tags", "dataset_version_ids"));
    mvc.perform(
            put(p + "/experiments/" + a.path("id").asLong())
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("completed"))
        .andExpect(jsonPath("$.tags[0]").value("demo"));
    a =
        ((com.fasterxml.jackson.databind.node.ArrayNode)
                json.readTree(
                    mvc.perform(get(p + "/experiments"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString()))
            .get(0);
    var text = input("text result", 1);
    ((ObjectNode) text.get("metrics")).put("accuracy", "95");
    var b = postJson(p + "/experiments", text);
    mvc.perform(
            post(p + "/comparisons")
                .contentType("application/json")
                .content(selection(a, b).toString()))
        .andExpect(status().isBadRequest());
    var c = postJson(p + "/experiments", input("real numeric", 95));
    var request = selection(a, c);
    request
        .withArray("experiments")
        .addObject()
        .put("id", b.path("id").asLong())
        .put("revision", 1);
    var result = postJson(p + "/comparisons", request);
    assertTrue(result.path("rows").get(2).path("metric_value").isNull());
    assertEquals(1, result.path("source_meta").path("missing_count").asInt());
  }
}
