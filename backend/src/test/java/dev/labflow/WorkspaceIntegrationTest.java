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
  void jsonPreviewDoesNotImportAndExplicitArrayRulesReplayOnCommit() throws Exception {
    long p =
        request("/api/projects", "{\"name\":\"JSON import test\",\"description\":\"synthetic\"}")
            .path("id")
            .asLong();
    String root = "/api/projects/" + p;
    var file =
        new MockMultipartFile(
            "file",
            "runs.json",
            "application/json",
            "{\"train\":[{\"epoch\":1,\"accuracy\":0.9}],\"test\":[{\"epoch\":2,\"accuracy\":0.8}]}"
                .getBytes());
    var preview =
        json.readTree(
            mvc.perform(multipart(root + "/datasets/preview").file(file))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(2, preview.path("record_paths").size());
    assertFalse(preview.path("issues").isEmpty());
    mvc.perform(get(root + "/datasets")).andExpect(content().json("[]"));
    String rules =
        "{\"schema_version\":1,\"delimiter\":\",\",\"sheet\":0,\"missingValues\":[],\"types\":{},\"roles\":{\"epoch\":\"x\",\"accuracy\":\"y\"},\"recordsPath\":\"/test\"}";
    var checked =
        json.readTree(
            mvc.perform(multipart(root + "/datasets/preview").file(file).param("rules", rules))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertTrue(checked.path("issues").isEmpty());
    var data =
        json.readTree(
            mvc.perform(multipart(root + "/datasets").file(file).param("rules", rules))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(checked.path("rows"), data.path("rows"));
    assertEquals("/test", data.at("/parse_rules/recordsPath").asText());
    mvc.perform(get(root + "/data/" + data.path("id").asLong() + "/original"))
        .andExpect(content().bytes(file.getBytes()));
  }

  @Test
  void empiricalAndPhysicalConfigSurviveRealMysql() throws Exception {
    long p =
        request(
                "/api/projects",
                "{\"name\":\"Publication and empirical test\",\"description\":\"synthetic\"}")
            .path("id")
            .asLong();
    String root = "/api/projects/" + p;
    var file =
        new MockMultipartFile(
            "file",
            "hist.csv",
            "text/csv",
            "epoch,accuracy,error\n1,1,0\n2,2,0\n3,2,0\n4,4,0".getBytes());
    var data =
        json.readTree(
            mvc.perform(multipart(root + "/datasets").file(file))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    var config =
        (com.fasterxml.jackson.databind.node.ObjectNode)
            json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    config.put("datasetVersionId", data.path("id").asLong()).put("x", "previous-dataset-field");
    config.set(
        "publication", json.readTree("{\"enabled\":true,\"widthMm\":89,\"fontPt\":7,\"dpi\":300}"));
    config.set(
        "empirical",
        json.readTree(
            "{\"bins\":2,\"start\":\"0\",\"end\":\"4\",\"normalization\":\"probability\",\"valueTitle\":\"Accuracy\",\"resultTitle\":\"\"}"));
    for (String type : new String[] {"histogram", "ecdf"}) {
      config.put("type", type);
      var body = json.createObjectNode().put("name", "Synthetic " + type);
      body.set("config", config);
      var chart = request(root + "/charts", body.toString());
      var reopened =
          json.readTree(
              mvc.perform(get(root + "/charts/" + chart.path("id").asLong()))
                  .andExpect(status().isOk())
                  .andReturn()
                  .getResponse()
                  .getContentAsString());
      assertEquals(json.readTree(config.toString()), reopened.path("config"));
    }
    mvc.perform(get(root + "/data/" + data.path("id").asLong() + "/original"))
        .andExpect(content().bytes(file.getBytes()));
  }

  @Test
  void evaluationAndBoundsRoundtripRejectForeignFieldsAndReversedBounds() throws Exception {
    long p =
        request(
                "/api/projects",
                "{\"name\":\"Synthetic evaluation acceptance\",\"description\":\"test\"}")
            .path("id")
            .asLong();
    String root = "/api/projects/" + p;
    var file =
        new MockMultipartFile(
            "file",
            "synthetic.csv",
            "text/csv",
            "epoch,accuracy,error,label,lower,upper\n1,0.1,0,0,0,0.2\n2,0.4,0,0,0.3,0.5\n3,0.35,0,1,0.3,0.4\n4,0.8,0,1,0.7,0.9"
                .getBytes());
    var d =
        json.readTree(
            mvc.perform(multipart(root + "/datasets").file(file))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    var c =
        (com.fasterxml.jackson.databind.node.ObjectNode)
            json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    c.put("datasetVersionId", d.path("id").asLong()).put("x", "previous-dataset-x");
    var e = c.putObject("evaluation");
    e.put("algorithm", "binary-ranking-v1")
        .put("missing", "exclude")
        .put("label", "label")
        .put("positive", "1")
        .put("threshold", 0.5)
        .put("baseline", true);
    for (String k : new String[] {"rocXTitle", "rocYTitle", "prXTitle", "prYTitle"}) e.put(k, "");
    var b =
        ((com.fasterxml.jackson.databind.node.ObjectNode) c.path("series").get(0))
            .putObject("band");
    b.put("enabled", true)
        .put("lower", "lower")
        .put("upper", "upper")
        .put("opacity", 0.18)
        .put("label", "Actual bounds");
    var body = json.createObjectNode().put("name", "Synthetic evaluation");
    body.set("config", c);
    for (String type : new String[] {"roc", "pr", "line"}) {
      c.put("type", type);
      if (type.equals("line")) c.put("x", "epoch");
      var chart = request(root + "/charts", body.toString());
      var reopened =
          json.readTree(
              mvc.perform(get(root + "/charts/" + chart.path("id").asLong()))
                  .andExpect(status().isOk())
                  .andReturn()
                  .getResponse()
                  .getContentAsString());
      assertEquals(json.readTree(c.toString()), reopened.path("config"));
    }
    b.put("lower", "upper").put("upper", "lower");
    mvc.perform(post(root + "/charts").contentType("application/json").content(body.toString()))
        .andExpect(status().isBadRequest());
    b.put("lower", "not_this_dataset").put("upper", "upper");
    mvc.perform(post(root + "/charts").contentType("application/json").content(body.toString()))
        .andExpect(status().isBadRequest());
    c.put("type", "roc");
    e.put("label", "not_this_dataset");
    mvc.perform(post(root + "/charts").contentType("application/json").content(body.toString()))
        .andExpect(status().isBadRequest());
    e.put("label", "label").put("positive", "unknown");
    mvc.perform(post(root + "/charts").contentType("application/json").content(body.toString()))
        .andExpect(status().isBadRequest());
    e.put("positive", "1");
    c.putArray("transforms")
        .addObject()
        .put("op", "filter")
        .put("field", "label")
        .put("operator", "eq")
        .put("value", "1");
    mvc.perform(post(root + "/charts").contentType("application/json").content(body.toString()))
        .andExpect(status().isBadRequest());
    mvc.perform(get(root + "/data/" + d.path("id").asLong() + "/original"))
        .andExpect(content().bytes(file.getBytes()));
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
