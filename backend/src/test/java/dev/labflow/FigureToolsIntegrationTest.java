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
        .andExpect(jsonPath("$.tools.length()").value(10));
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
  void profileAndStructuralPreviewReadTheSameVersionWithoutWriting() throws Exception {
    long p = project(), data = dataset(p);
    mvc.perform(get("/api/projects/" + p + "/data/" + data + "/profile"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.dataset_version_id").value(data))
        .andExpect(jsonPath("$.row_count").value(2))
        .andExpect(jsonPath("$.fields[0].name").value("epoch"))
        .andExpect(jsonPath("$.fields[1].type").value("number"))
        .andExpect(jsonPath("$.head.length()").value(2))
        .andExpect(jsonPath("$.truncated.columns").value(false));
    var req = json.createObjectNode().put("protocol_version", 1);
    req.set("config", config(data));
    req.set(
        "operations",
        json.readTree(
            """
            [{"tool":"set_chart","arguments":{"type":"bar"}},
             {"tool":"set_mapping","arguments":{"x":"epoch","group":""}},
             {"tool":"map_series","arguments":{"seriesId":"s1","y":"accuracy"}},
             {"tool":"add_series","arguments":{"id":"s2","y":"error"}}]
            """));
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.config.type").value("bar"))
        .andExpect(jsonPath("$.config.series.length()").value(2))
        .andExpect(jsonPath("$.source.dataset_version_id").value(data));
    req.set(
        "operations",
        json.readTree("[{\"tool\":\"set_mapping\",\"arguments\":{\"x\":\"nope\"}}]"));
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isBadRequest());
    req.set(
        "operations",
        json.readTree("[{\"tool\":\"set_chart\",\"arguments\":{\"type\":\"roc\"}}]"));
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isBadRequest());
    assertTrue(workspace.charts(p).isEmpty());
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

  @Test
  void figureSpecDescribesRolesPerTypeWithoutTouchingData() throws Exception {
    mvc.perform(get("/api/figure-tools/spec"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.execution").value("read-only"))
        .andExpect(jsonPath("$.types.length()").value(11))
        .andExpect(jsonPath("$.series.max").value(20))
        .andExpect(jsonPath("$.roles.heatZ").exists());
    mvc.perform(get("/api/figure-tools/spec").param("type", "heatmap"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.types.length()").value(1))
        .andExpect(jsonPath("$.types[0].required_roles[0]").value("x"))
        .andExpect(jsonPath("$.types[0].required_roles[1]").value("heatY"))
        .andExpect(jsonPath("$.types[0].required_roles[2]").value("heatZ"));
    mvc.perform(get("/api/figure-tools/spec").param("type", "histogram"))
        .andExpect(jsonPath("$.types[0].required_roles.length()").value(1))
        .andExpect(jsonPath("$.types[0].required_roles[0]").value("y"));
    mvc.perform(get("/api/figure-tools/spec").param("type", "pie"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void lintReturnsIssuesAsDataAndNeverWrites() throws Exception {
    long p = project(), data = dataset(p);
    var c = config(data);
    var body = json.createObjectNode().put("protocol_version", 1);
    body.set("config", c);
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/lint")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true))
        .andExpect(jsonPath("$.issues.length()").value(0))
        .andExpect(jsonPath("$.source.dataset_version_id").value(data));
    var broken = c.deepCopy();
    ((ObjectNode) broken.path("series").get(0)).put("y", "nope");
    body.set("config", broken);
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/lint")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.issues[0].code").value("invalid_figure"))
        .andExpect(
            jsonPath("$.issues[0].message").value(org.hamcrest.Matchers.containsString("Y 字段")));
    assertTrue(workspace.charts(p).isEmpty());
    body.put("protocol_version", 2);
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/lint")
                .contentType("application/json")
                .content(body.toString()))
        .andExpect(status().isBadRequest());
  }

  @Test
  void aMixedBatchIsAllOrNothingAndLeavesNoPartialPreview() throws Exception {
    long p = project(), data = dataset(p);
    var c = config(data);
    var req = json.createObjectNode().put("protocol_version", 1);
    req.set("config", c);
    req.set(
        "operations",
        json.readTree(
            """
            [{"tool":"set_style","arguments":{"fontSize":18}},
             {"tool":"set_mapping","arguments":{"x":"nope"}}]
            """));
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.message").value(org.hamcrest.Matchers.containsString("X 字段")));
    // The first operation is valid on its own and still applies when submitted alone, which proves
    // the failed batch returned nothing instead of a half-applied config.
    req.set("operations", json.readTree("[{\"tool\":\"set_style\",\"arguments\":{\"fontSize\":18}}]"));
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.config.style.fontSize").value(18));
    assertTrue(workspace.charts(p).isEmpty());
    // A saved chart must keep its revision and history when a later batch is rejected.
    long chart = id(workspace.saveChart(p, null, "Atomic", null, c));
    var before = workspace.chart(p, chart);
    req.put("chart_id", chart).put("base_revision", 1);
    req.set(
        "operations",
        json.readTree(
            """
            [{"tool":"set_style","arguments":{"fontSize":20}},
             {"tool":"set_series","arguments":{"seriesId":"s1","y":"missing_column"}}]
            """));
    mvc.perform(
            post("/api/projects/" + p + "/figure-tools/preview")
                .contentType("application/json")
                .content(req.toString()))
        .andExpect(status().isBadRequest());
    assertEquals(before, workspace.chart(p, chart));
    assertEquals(1, workspace.versions(p, chart).size());
  }
}
