package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.repository.WorkspaceRepository;
import dev.labflow.service.WorkspaceService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties =
        "spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_test?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC")
@AutoConfigureMockMvc
class FigureToolsIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired WorkspaceService workspace;
  @Autowired WorkspaceRepository db;

  long id(Object value) {
    return json.valueToTree(value).path("id").asLong();
  }

  ObjectNode config(long dataset) throws Exception {
    var c = (ObjectNode) json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    c.put("datasetVersionId", dataset);
    return c;
  }

  ObjectNode request(JsonNode config) throws Exception {
    var req = json.createObjectNode().put("protocol_version", 1);
    req.set("config", config);
    req.set(
        "operations", json.readTree("[{\"tool\":\"set_style\",\"arguments\":{\"fontSize\":18}}]"));
    return req;
  }

  long project() {
    return id(workspace.createProject("Figure tools integration", "synthetic test"));
  }

  long dataset(long p) {
    return id(
        workspace.upload(
            p,
            null,
            "synthetic.csv",
            "epoch,accuracy,error\n1,0.7,0.01\n2,0.8,0.02".getBytes(StandardCharsets.UTF_8)));
  }

  @Test
  void catalogAndPreviewUseRealDataWithoutCreatingAnyVersions() throws Exception {
    mvc.perform(get("/api/figure-tools/catalog"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.tools.length()").value(5));
    long p = project(), data = dataset(p);
    var c = config(data);
    var saved = workspace.saveChart(p, null, "Original", null, c);
    long chart = id(saved);
    var req = request(c).put("chart_id", chart).put("base_revision", 1);
    var before = workspace.chart(p, chart);
    var bytes = workspace.original(p, data).get("original_file");
    String response =
        mvc.perform(
                post("/api/projects/" + p + "/figure-tools/preview")
                    .contentType("application/json")
                    .content(req.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.config.style.fontSize").value(18))
            .andExpect(jsonPath("$.source.dataset_version_id").value(data))
            .andExpect(jsonPath("$.changes[0].path").value("/style/fontSize"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertEquals(before, workspace.chart(p, chart));
    assertEquals(1, workspace.versions(p, chart).size());
    assertArrayEquals((byte[]) bytes, (byte[]) workspace.original(p, data).get("original_file"));
    var changed = json.readTree(response).path("config");
    workspace.saveChart(p, chart, "Original", 1, changed);
    assertEquals(2, workspace.versions(p, chart).size());
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isConflict());
  }

  @Test
  void crossProjectDataChartAndUnsupportedEnvelopesAreRejected() throws Exception {
    long a = project(), b = project(), data = dataset(a);
    var c = config(data);
    var req = request(c);
    mvc.perform(
            post("/api/projects/" + b + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isNotFound());
    long chart = id(workspace.saveChart(a, null, "Original", null, c));
    req.put("chart_id", chart).put("base_revision", 1);
    mvc.perform(
            post("/api/projects/" + b + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isNotFound());
    req.put("execute", true);
    mvc.perform(
            post("/api/projects/" + a + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isBadRequest());
    req.remove("execute");
    req.put("protocol_version", 4294967297L);
    mvc.perform(
            post("/api/projects/" + a + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isBadRequest());
  }
}
