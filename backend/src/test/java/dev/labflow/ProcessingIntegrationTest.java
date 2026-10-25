package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@LabflowIntegrationTest
@AutoConfigureMockMvc
class ProcessingIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  JsonNode postJson(String path, Object body) throws Exception {
    return json.readTree(
        mvc.perform(
                post(path)
                    .contentType("application/json")
                    .content(
                        body instanceof String ? body.toString() : json.writeValueAsString(body)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8));
  }

  long project() throws Exception {
    return postJson(
            "/api/projects",
            "{\"name\":\"Synthetic processing integration\",\"description\":\"test\"}")
        .path("id")
        .asLong();
  }

  final byte[] bytes =
      "model,epoch,seed,accuracy\nA,2,1,4\nA,1,1,1\nA,1,2,2\nA,1,3,3\nA,1,4,\nA,2,2,6"
          .getBytes(StandardCharsets.UTF_8);

  JsonNode upload(long p) throws Exception {
    return json.readTree(
        mvc.perform(
                multipart("/api/projects/" + p + "/datasets")
                    .file(new MockMultipartFile("file", "synthetic.csv", "text/csv", bytes)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  ObjectNode body() throws Exception {
    return (ObjectNode)
        json.readTree(
            """
{"name":"均值与 SEM · synthetic","rules":{"schema_version":1,"mode":"aggregate","groupBy":["model","epoch"],"metrics":["accuracy"],"filters":[],"sort":[{"field":"epoch","direction":"asc"}],"missingGroup":"include","error":"sem","observationUnit":"independent seed at fixed epoch","replicate":"seed","x":"epoch","group":"model","display":"band"}}
""");
  }

  @Test
  void previewDoesNotWriteCommitMatchesAndFigureRestoresFromRealMysql() throws Exception {
    long p = project();
    var source = upload(p);
    String root = "/api/projects/" + p,
        path = root + "/data/" + source.path("id").asLong() + "/process";
    var body = body();
    var preview = postJson(path + "/preview", body);
    mvc.perform(get(root + "/datasets")).andExpect(jsonPath("$.length()").value(1));
    var result = postJson(path, body);
    assertEquals(preview.path("rows"), result.path("rows"));
    assertEquals(preview.path("fields"), result.path("fields"));
    assertEquals(
        json.readTree(body.path("rules").toString()), result.path("source_meta").path("rules"));
    assertEquals(source.path("sha256"), result.path("source_meta").path("source").path("sha256"));
    assertNotEquals(source.path("dataset_id"), result.path("dataset_id"));
    assertEquals(3, result.path("rows").get(0).path("accuracy__n").asInt());
    assertEquals(2, result.path("rows").get(0).path("accuracy__mean").asDouble());
    assertEquals(
        1 / Math.sqrt(3), result.path("rows").get(0).path("accuracy__sem").asDouble(), 1e-15);
    var c = (ObjectNode) json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    c.put("datasetVersionId", result.path("id").asLong());
    var series = (ObjectNode) c.path("series").get(0);
    series.put("y", "accuracy__mean").put("error", "accuracy__sem");
    var chartBody = json.createObjectNode().put("name", "Derived means");
    chartBody.set("config", c);
    var chart = postJson(root + "/charts", chartBody);
    var reopened =
        json.readTree(
            mvc.perform(get(root + "/charts/" + chart.path("id").asLong()))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(json.readTree(c.toString()), reopened.path("config"));
    var actualBytes =
        mvc.perform(get(root + "/data/" + result.path("id").asLong() + "/original"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    assertEquals(
        result.path("sha256").asText(),
        java.util.HexFormat.of()
            .formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(actualBytes)));
    mvc.perform(get(root + "/data/" + source.path("id").asLong() + "/original"))
        .andExpect(content().bytes(bytes));
    mvc.perform(get(root + "/datasets"))
        .andExpect(jsonPath("$[0].source_meta.kind").value("data_processing"));
  }

  @Test
  void rejectsForeignVersionsFieldsAndMalformedRulesWithoutWriting() throws Exception {
    long p = project();
    var source = upload(p);
    String root = "/api/projects/" + p,
        path = root + "/data/" + source.path("id").asLong() + "/process";
    var body = body();
    mvc.perform(
            post("/api/projects/"
                    + project()
                    + "/data/"
                    + source.path("id").asLong()
                    + "/process/preview")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isNotFound());
    ((ObjectNode) body.path("rules")).putArray("groupBy").add("foreign_field");
    mvc.perform(post(path).contentType("application/json").content(body.toString()))
        .andExpect(status().isBadRequest());
    var invalid = body();
    ((ObjectNode) invalid.path("rules")).putNull("sort");
    mvc.perform(post(path + "/preview").contentType("application/json").content(invalid.toString()))
        .andExpect(status().isBadRequest());
    var duplicate = body();
    ((ObjectNode) duplicate.path("rules")).putArray("groupBy").add("model");
    ((ObjectNode) duplicate.path("rules"))
        .put("x", "model")
        .put("group", "")
        .put("display", "bars");
    mvc.perform(post(path).contentType("application/json").content(duplicate.toString()))
        .andExpect(status().isBadRequest());
    var dangerous = body().put("name", "../unsafe");
    mvc.perform(post(path).contentType("application/json").content(dangerous.toString()))
        .andExpect(status().isBadRequest());
    mvc.perform(get(root + "/datasets")).andExpect(jsonPath("$.length()").value(1));
  }

  @Test
  void sortingCanChainFromImmutableDerivedDataWithoutOverwritingSource() throws Exception {
    long p = project();
    var source = upload(p);
    String root = "/api/projects/" + p;
    var derived = postJson(root + "/data/" + source.path("id").asLong() + "/process", body());
    var sorted = body().put("name", "sorted result");
    var r = (ObjectNode) sorted.path("rules");
    r.put("mode", "sort");
    r.putArray("sort").addObject().put("field", "epoch").put("direction", "desc");
    var result = postJson(root + "/data/" + derived.path("id").asLong() + "/process", sorted);
    assertEquals(2, result.path("rows").get(0).path("epoch").asInt());
    assertEquals(
        derived.path("id"), result.path("source_meta").path("source").path("datasetVersionId"));
    mvc.perform(get(root + "/data/" + derived.path("id").asLong()))
        .andExpect(jsonPath("$.rows[0].epoch").value(1));
    mvc.perform(get(root + "/data/" + source.path("id").asLong() + "/original"))
        .andExpect(content().bytes(bytes));
  }
}
