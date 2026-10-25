package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@LabflowIntegrationTest
@AutoConfigureMockMvc
class ClassificationIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  final byte[] bytes =
      "id,truth,a,b\n1,A,A,A\n2,A,B,\n3,B,B,C\n4,B,C,B\n5,C,C,C\n6,C,C,A\n7,C,,C\n8,,A,A\n9,A,,B"
          .getBytes(StandardCharsets.UTF_8);

  JsonNode postJson(String path, JsonNode body) throws Exception {
    return json.readTree(
        mvc.perform(post(path).contentType("application/json").content(body.toString()))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8));
  }

  long project() throws Exception {
    return postJson(
            "/api/projects",
            json.createObjectNode()
                .put("name", "Synthetic multiclass acceptance")
                .put("description", "test"))
        .path("id")
        .asLong();
  }

  JsonNode upload(long p) throws Exception {
    return json.readTree(
        mvc.perform(
                multipart("/api/projects/" + p + "/datasets")
                    .file(
                        new MockMultipartFile("file", "synthetic-classes.csv", "text/csv", bytes)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  ObjectNode config(long id) throws Exception {
    var c = (ObjectNode) json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    c.put("datasetVersionId", id).put("type", "confusion");
    var a = (ObjectNode) c.path("series").get(0);
    a.put("prediction", "a").put("error", "").put("y", "unused-old-score");
    var b = a.deepCopy().put("id", "b").put("prediction", "b");
    ((ArrayNode) c.path("series")).add(b);
    c.set("classification", new ClassificationEvaluatorTest().config().path("classification"));
    c.putObject("sampling").put("policy", "independent").put("id", "id");
    return c;
  }

  @Test
  void actualLabelReportAndMysqlConfigurationRoundtrip() throws Exception {
    long p = project();
    var data = upload(p);
    String root = "/api/projects/" + p;
    var c = config(data.path("id").asLong());
    var body = json.createObjectNode();
    body.set("config", c);
    var report = postJson(root + "/classification/report", body);
    assertEquals(6, report.path("reports").get(0).path("n").asInt());
    assertEquals(7, report.path("reports").get(1).path("n").asInt());
    assertEquals(
        json.readTree("[[1,1,0],[0,1,1],[0,0,2]]"), report.path("reports").get(0).path("counts"));
    ((ObjectNode) c.path("sampling")).put("policy", "intersection");
    ((ObjectNode) c.path("classification")).put("normalization", "true");
    var common = postJson(root + "/classification/report", body);
    assertEquals(.8, common.path("reports").get(0).path("accuracy").asDouble());
    assertEquals(
        common.path("reports").get(0).path("sampleRows"),
        common.path("reports").get(1).path("sampleRows"));
    body.put("name", "Classification configuration");
    var chart = postJson(root + "/charts", body);
    var reopened =
        json.readTree(
            mvc.perform(get(root + "/charts/" + chart.path("id").asLong()))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(json.readTree(c.toString()), reopened.path("config"));
    assertEquals(
        common,
        postJson(
            root + "/classification/report",
            json.createObjectNode().set("config", reopened.path("config"))));
    mvc.perform(get(root + "/data/" + data.path("id").asLong() + "/original"))
        .andExpect(content().bytes(bytes));
  }

  @Test
  void refusesUnknownClassesForeignFieldsAndInvalidSampleIds() throws Exception {
    long p = project();
    var data = upload(p);
    var c = config(data.path("id").asLong());
    String root = "/api/projects/" + p;
    var body = json.createObjectNode().set("config", c);
    mvc.perform(
            post("/api/projects/" + project() + "/classification/report")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isNotFound());
    ((ObjectNode) c.path("sampling")).put("id", "truth");
    mvc.perform(
            post(root + "/classification/report")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isBadRequest());
    ((ObjectNode) c.path("sampling")).put("id", "id");
    ((ObjectNode) c.path("series").get(0)).put("prediction", "foreign_column");
    mvc.perform(
            post(root + "/classification/report")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isBadRequest());
    ((ObjectNode) c.path("series").get(0)).put("prediction", "a");
    ((ObjectNode) c.path("classification")).putArray("classes").add("A").add("B");
    mvc.perform(
            post(root + "/classification/report")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isBadRequest());
  }
}
