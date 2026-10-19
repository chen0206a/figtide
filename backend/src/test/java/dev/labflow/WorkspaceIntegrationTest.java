package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
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
class WorkspaceIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  JsonNode request(String url, String body) throws Exception {
    return json.readTree(
        mvc.perform(post(url).contentType("application/json").content(body))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  @Test
  void realMySqlRoundtripVersionIsolationAndConflict() throws Exception {
    long p =
        request(
                "/api/projects",
                "{\"name\":\"Integration project\",\"description\":\"isolated test database\"}")
            .path("id")
            .asLong();
    String root = "/api/projects/" + p;
    var file =
        new MockMultipartFile(
            "file",
            "中文.csv",
            "text/csv",
            "epoch,accuracy,error\n1,80,1.2\n2,90,0.5"
                .getBytes(java.nio.charset.StandardCharsets.UTF_8));
    var d =
        json.readTree(
            mvc.perform(multipart(root + "/datasets").file(file))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    var config = json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    ((com.fasterxml.jackson.databind.node.ObjectNode) config)
        .put("datasetVersionId", d.path("id").asLong());
    var body = json.createObjectNode().put("name", "Figure one").set("config", config);
    var chart = request(root + "/charts", body.toString());
    long id = chart.path("id").asLong();
    assertEquals(json.readTree(config.toString()), chart.path("config"));
    var restored =
        json.readTree(
            mvc.perform(get(root + "/charts/" + id))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(json.readTree(config.toString()), restored.path("config"));
    ((com.fasterxml.jackson.databind.node.ObjectNode) body).put("revision", 1);
    mvc.perform(
            put(root + "/charts/" + id).contentType("application/json").content(body.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(2));
    mvc.perform(
            put(root + "/charts/" + id).contentType("application/json").content(body.toString()))
        .andExpect(status().isConflict());
    mvc.perform(get(root + "/charts/" + id + "/versions"))
        .andExpect(jsonPath("$.length()").value(2));
    long other =
        request("/api/projects", "{\"name\":\"Other\",\"description\":\"\"}").path("id").asLong();
    mvc.perform(get("/api/projects/" + other + "/data/" + d.path("id").asLong()))
        .andExpect(status().isNotFound());
    mvc.perform(
            post("/api/projects/" + other + "/charts")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isNotFound());
    mvc.perform(
            multipart(root + "/datasets/" + d.path("dataset_id").asLong() + "/versions").file(file))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(2));
    mvc.perform(get(root + "/data/" + d.path("id").asLong()))
        .andExpect(jsonPath("$.version").value(1));
    byte[] original =
        mvc.perform(get(root + "/data/" + d.path("id").asLong() + "/original"))
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    assertArrayEquals(file.getBytes(), original);
  }

  @Test
  void pathAndSchemaAreValidated() throws Exception {
    long p =
        request("/api/projects", "{\"name\":\"Validation\",\"description\":\"\"}")
            .path("id")
            .asLong();
    mvc.perform(
            multipart("/api/projects/" + p + "/datasets")
                .file(
                    new MockMultipartFile(
                        "file", "../../evil.csv", "text/csv", "x,y\n1,2".getBytes())))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/projects/" + p + "/charts")
                .contentType("application/json")
                .content("{\"name\":\"Bad\",\"config\":{\"schema_version\":2}}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void previewCommitRulesAndArchiveRoundtrip() throws Exception {
    long p =
        request("/api/projects", "{\"name\":\"Import contract\",\"description\":\"test\"}")
            .path("id")
            .asLong();
    String root = "/api/projects/" + p;
    var file =
        new MockMultipartFile(
            "file",
            "规则.csv",
            "text/csv",
            "epoch;score\n1;NA\n2;92".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    String rules =
        "{\"schema_version\":1,\"delimiter\":\";\",\"sheet\":0,\"missingValues\":[\"NA\"],\"types\":{\"score\":\"number\"},\"roles\":{\"epoch\":\"x\",\"score\":\"y\"}}";
    var preview =
        json.readTree(
            mvc.perform(multipart(root + "/datasets/preview").file(file).param("rules", rules))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    mvc.perform(get(root + "/datasets")).andExpect(jsonPath("$.length()").value(0));
    var saved =
        json.readTree(
            mvc.perform(multipart(root + "/datasets").file(file).param("rules", rules))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(preview.path("fields"), saved.path("fields"));
    assertEquals(preview.path("rows"), saved.path("rows"));
    assertEquals(json.readTree(rules), saved.path("parse_rules"));
    mvc.perform(get(root + "/data/" + saved.path("id").asLong() + "/original"))
        .andExpect(content().bytes(file.getBytes()));
    mvc.perform(
            put(root)
                .contentType("application/json")
                .content("{\"name\":\"Renamed\",\"description\":\"test\",\"archived\":true}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.archived").value(true));
    mvc.perform(get(root + "/data/" + saved.path("id").asLong())).andExpect(status().isOk());
  }

  @Test
  void invalidPreviewCannotCommit() throws Exception {
    long p =
        request("/api/projects", "{\"name\":\"Bad import\",\"description\":\"test\"}")
            .path("id")
            .asLong();
    String root = "/api/projects/" + p;
    var file = new MockMultipartFile("file", "bad.csv", "text/csv", "score\n<0.01".getBytes());
    String rules =
        "{\"schema_version\":1,\"delimiter\":\",\",\"sheet\":0,\"missingValues\":[],\"types\":{\"score\":\"number\"},\"roles\":{}}";
    mvc.perform(multipart(root + "/datasets/preview").file(file).param("rules", rules))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.issues[0].row").value(2));
    mvc.perform(multipart(root + "/datasets").file(file).param("rules", rules))
        .andExpect(status().isBadRequest());
    mvc.perform(get(root + "/datasets")).andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void professionalChartRoundtripAndInvalidFacetOwnership() throws Exception {
    long p =
        request(
                "/api/projects",
                "{\"name\":\"Professional plots test\",\"description\":\"synthetic\"}")
            .path("id")
            .asLong();
    String root = "/api/projects/" + p;
    var file =
        new MockMultipartFile(
            "file",
            "repeats.csv",
            "text/csv",
            "epoch,accuracy,error\n1,80,1\n1,82,1\n1,84,1\n2,85,1\n2,86,1\n2,87,1".getBytes());
    var d =
        json.readTree(
            mvc.perform(multipart(root + "/datasets").file(file))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    var config =
        (com.fasterxml.jackson.databind.node.ObjectNode)
            json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    config.put("datasetVersionId", d.path("id").asLong()).put("type", "box");
    config.set(
        "distribution",
        json.readTree(
            """
{"points":"all","quartileMethod":"inclusive","mean":true,"innerBox":false,"bandwidth":"","span":"hard"}
"""));
    config.set(
        "facet",
        json.readTree(
            """
{"mode":"field","field":"epoch","columns":2,"gapX":90,"gapY":100,"shareX":true,"shareY":true,"labels":true,"titles":{"field:epoch:1":"Repeat A"}}
"""));
    var body = json.createObjectNode().put("name", "Reproducible distribution");
    body.set("config", config);
    var chart = request(root + "/charts", body.toString());
    long id = chart.path("id").asLong();
    assertEquals(json.readTree(config.toString()), chart.path("config"));
    config.put("type", "violin");
    body.put("revision", 1);
    mvc.perform(
            put(root + "/charts/" + id).contentType("application/json").content(body.toString()))
        .andExpect(status().isOk());
    var reopened =
        json.readTree(
            mvc.perform(get(root + "/charts/" + id))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(json.readTree(config.toString()), reopened.path("config"));
    mvc.perform(get(root + "/charts/" + id + "/versions"))
        .andExpect(jsonPath("$[1].config.type").value("box"));
    ((com.fasterxml.jackson.databind.node.ObjectNode) config.path("facet"))
        .put("field", "other_project_column");
    mvc.perform(post(root + "/charts").contentType("application/json").content(body.toString()))
        .andExpect(status().isBadRequest());
    mvc.perform(get(root + "/data/" + d.path("id").asLong() + "/original"))
        .andExpect(content().bytes(file.getBytes()));
  }
}
