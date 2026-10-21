package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.processing.ProcessingRules;
import dev.labflow.repository.WorkspaceRepository;
import dev.labflow.service.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties =
        "spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_test?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC")
@AutoConfigureMockMvc
class DeliveryIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired WorkspaceService workspace;
  @Autowired BackupService backups;
  @Autowired StyleTemplateService styles;
  @Autowired ExperimentService experiments;
  @Autowired ProcessingService processing;
  @Autowired WorkspaceRepository db;
  @Autowired ObjectMapper json;

  @Test
  void renameStyleViaApiPreservesProfileAndOwnershipAndValidatesInput() throws Exception {
    long p = project();
    var data = workspace.upload(p, null, "template.csv", csv);
    var created = json.valueToTree(styles.save(p, "Original", config(number(data, "id"))));
    long id = created.path("id").asLong();
    var before = db.one("SELECT * FROM style_templates WHERE id=?", id);
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/style-templates/" + id)
        .contentType("application/json").content("{\"name\":\"  论文样式 α  \"}"))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
    var after = db.one("SELECT * FROM style_templates WHERE id=?", id);
    assertEquals("论文样式 α", after.get("name"));
    assertEquals(before.get("project_id"), after.get("project_id"));
    assertEquals(before.get("profile_json"), after.get("profile_json"));
    for (String name : List.of("   ", "x".repeat(121))) {
      mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/style-templates/" + id)
          .contentType("application/json").content(json.createObjectNode().put("name", name).toString()))
          .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
    }
    styles.rename(id, "论文样式 α"); // Renaming to the same name remains idempotent.
    styles.delete(id);
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/style-templates/" + id)
        .contentType("application/json").content("{\"name\":\"Missing\"}"))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
  }

  long number(Map<String, Object> r, String key) {
    return ((Number) r.get(key)).longValue();
  }

  long project() {
    return number(workspace.createProject("科研成果交付测试 · 合成", "synthetic test"), "id");
  }

  final byte[] csv =
      "epoch,accuracy,error\n1,0.8,0.01\n1,0.9,0.02\n2,0.95,0.01".getBytes(StandardCharsets.UTF_8);

  ObjectNode config(long id) throws Exception {
    var c = (ObjectNode) json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    c.put("datasetVersionId", id);
    return c;
  }

  byte[] manifest(byte[] zip) throws Exception {
    try (var in = new ZipInputStream(new ByteArrayInputStream(zip))) {
      ZipEntry e;
      while ((e = in.getNextEntry()) != null)
        if (e.getName().equals("manifest.json")) return in.readAllBytes();
    }
    throw new IllegalStateException();
  }

  byte[] zip(byte[] manifest, String path, boolean validHash) throws Exception {
    var bytes = new ByteArrayOutputStream();
    try (var out = new ZipOutputStream(bytes)) {
      out.putNextEntry(new ZipEntry(path));
      out.write(manifest);
      out.closeEntry();
      out.putNextEntry(new ZipEntry("sha256.txt"));
      out.write(
          (validHash
                  ? HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(manifest))
                  : "0".repeat(64))
              .getBytes(StandardCharsets.US_ASCII));
      out.closeEntry();
    }
    return bytes.toByteArray();
  }

  @Test
  void fullHistoryOriginalBytesDerivedProvenanceAndExperimentLinksRestoreAsNewProject()
      throws Exception {
    long p = project();
    var d1 = workspace.upload(p, null, "中文.csv", csv);
    var d2 = workspace.upload(p, number(d1, "dataset_id"), "中文-v2.csv", csv);
    long source = number(d2, "id");
    var rules =
        json.readValue(
            """
{"schema_version":1,"mode":"aggregate","groupBy":["epoch"],"metrics":["accuracy"],"filters":[],"sort":[],"missingGroup":"include","error":"sem","observationUnit":"seed","replicate":"","x":"epoch","group":"","display":"bars"}
""",
            ProcessingRules.class);
    var derived = processing.commit(p, source, "均值", rules);
    var a =
        experiments.save(
            p,
            null,
            "基线",
            json.createObjectNode().put("seed", source),
            json.createObjectNode().put("accuracy", 0.8),
            "note",
            "completed",
            List.of("demo"),
            List.of(source),
            null);
    var b =
        experiments.save(
            p,
            null,
            "改进",
            json.createObjectNode(),
            json.createObjectNode().put("accuracy", 0.9),
            "",
            "completed",
            List.of(),
            List.of(number(derived, "id")),
            null);
    experiments.snapshot(
        p,
        List.of(
            new ExperimentService.Selection(number(a, "id"), 1),
            new ExperimentService.Selection(number(b, "id"), 1)),
        number(a, "id"),
        "accuracy",
        "higher",
        "bar");
    var c = config(source);
    var chart = workspace.saveChart(p, null, "实验图", null, c);
    ((ObjectNode) c.path("style")).put("title", "中文 · 可复现成果");
    workspace.saveChart(p, number(chart, "id"), "实验图", 1, c);
    styles.save(p, "个人风格", c);
    var archive = backups.export(p);
    int before = workspace.projects().size();
    var preview = backups.preview(archive);
    assertEquals(before, workspace.projects().size());
    assertEquals(4, ((Map<?, ?>) preview.get("counts")).get("dataset_versions"));
    var restored = backups.restore(archive, "独立恢复项目");
    long restoredId = number(restored, "id");
    assertNotEquals(p, restoredId);
    var data = workspace.datasets(restoredId);
    assertEquals(4, data.size());
    var sourceCopy =
        data.stream().filter(d -> d.get("filename").equals("中文-v2.csv")).findFirst().orElseThrow();
    long restoredSource = number(sourceCopy, "id");
    assertNotEquals(source, restoredSource);
    assertEquals(d2.get("sha256"), sourceCopy.get("sha256"));
    assertEquals(2, number(sourceCopy, "version"));
    assertArrayEquals(
        csv, (byte[]) workspace.original(restoredId, restoredSource).get("original_file"));
    var derivative =
        data.stream()
            .filter(
                d ->
                    d.get("source_meta") instanceof Map<?, ?> m
                        && "data_processing".equals(m.get("kind")))
            .findFirst()
            .orElseThrow();
    var meta = json.valueToTree(derivative.get("source_meta"));
    assertEquals(restoredSource, meta.path("source").path("datasetVersionId").asLong());
    assertEquals(number(sourceCopy, "dataset_id"), meta.path("source").path("datasetId").asLong());
    assertEquals(
        workspace.data(p, number(derived, "id")).get("rows"),
        workspace.data(restoredId, number(derivative, "id")).get("rows"));
    var records = experiments.list(restoredId);
    var copyA = records.stream().filter(e -> e.get("name").equals("基线")).findFirst().orElseThrow();
    assertEquals(source, json.valueToTree(copyA.get("parameters")).path("seed").asLong());
    assertEquals(List.of(restoredSource), copyA.get("dataset_version_ids"));
    var snapshot =
        data.stream()
            .filter(
                d ->
                    d.get("source_meta") instanceof Map<?, ?> m
                        && "experiment_comparison".equals(m.get("kind")))
            .findFirst()
            .orElseThrow();
    var sm = json.valueToTree(snapshot.get("source_meta"));
    assertEquals(number(copyA, "id"), sm.path("baseline_id").asLong());
    assertEquals(
        restoredSource, sm.path("experiments").get(0).path("dataset_version_ids").get(0).asLong());
    assertEquals(restoredId, sm.path("experiments").get(0).path("project_id").asLong());
    assertEquals(
        number(copyA, "id"),
        sm.path("experiments").get(0).path("datasets").get(0).path("experiment_id").asLong());
    long newChart = number(workspace.charts(restoredId).getFirst(), "id");
    var reopened = workspace.chart(restoredId, newChart);
    c.put("datasetVersionId", restoredSource);
    assertEquals(json.readTree(c.toString()), json.valueToTree(reopened.get("config")));
    assertEquals(2, workspace.versions(restoredId, newChart).size());
    workspace.saveChart(restoredId, newChart, "恢复后继续编辑", 2, c);
    assertEquals(2, number(workspace.chart(p, number(chart, "id")), "revision"));
    assertEquals(
        1, db.query("SELECT id FROM style_templates WHERE project_id=?", restoredId).size());
    assertEquals(
        db.one("SELECT created_at FROM projects WHERE id=?", p).get("created_at"),
        db.one("SELECT created_at FROM projects WHERE id=?", restoredId).get("created_at"));
  }

  @Test
  void invalidChecksumPathsReferencesAndVersionsNeverCreateProjects() throws Exception {
    long p = project();
    var d = workspace.upload(p, null, "source.csv", csv);
    workspace.saveChart(p, null, "图", null, config(number(d, "id")));
    var archive = backups.export(p);
    var raw = manifest(archive);
    int before = workspace.projects().size();
    assertThrows(
        ApiException.class, () -> backups.restore(zip(raw, "manifest.json", false), "bad"));
    assertThrows(ApiException.class, () -> backups.preview(zip(raw, "../manifest.json", true)));
    assertThrows(
        ApiException.class, () -> backups.preview(zip(new byte[0], "manifest.json", true)));
    var root = (ObjectNode) json.readTree(raw);
    ((ObjectNode) root.path("tables").path("chart_versions").get(0))
        .put("dataset_version_id", 99999999);
    var invalidRef = json.writeValueAsBytes(root);
    assertThrows(
        ApiException.class,
        () -> backups.restore(zip(invalidRef, "manifest.json", true), "bad ref"));
    root = (ObjectNode) json.readTree(raw);
    ((ObjectNode) root.path("tables").path("charts").get(0)).put("revision", 3);
    var invalid = json.writeValueAsBytes(root);
    assertThrows(
        ApiException.class,
        () -> backups.restore(zip(invalid, "manifest.json", true), "bad history"));
    assertEquals(before, workspace.projects().size());
  }

  @Test
  void semanticConfigFailureRollsBackAllInsertedRows() throws Exception {
    long p = project();
    var d = workspace.upload(p, null, "source.csv", csv);
    workspace.saveChart(p, null, "图", null, config(number(d, "id")));
    var root = (ObjectNode) json.readTree(manifest(backups.export(p)));
    var row = (ObjectNode) root.path("tables").path("chart_versions").get(0);
    var c = (ObjectNode) json.readTree(row.path("config_json").asText());
    ((ObjectNode) c.path("series").get(0)).put("y", "nonexistent");
    row.put("config_json", c.toString());
    var archive = zip(json.writeValueAsBytes(root), "manifest.json", true);
    int before = workspace.projects().size();
    long rows = ((Number) db.one("SELECT COUNT(*) n FROM dataset_versions").get("n")).longValue();
    assertThrows(ApiException.class, () -> backups.restore(archive, "rollback"));
    assertEquals(before, workspace.projects().size());
    assertEquals(
        rows, ((Number) db.one("SELECT COUNT(*) n FROM dataset_versions").get("n")).longValue());
  }

  @Test
  void emptyAndArchivedProjectsRestoreWithoutOverwritingOriginal() throws Exception {
    long p = project();
    workspace.updateProject(p, "归档源项目", "test", true);
    var archive = backups.export(p);
    long copy = number(backups.restore(archive, "新工作区"), "id");
    assertTrue((Boolean) db.one("SELECT archived FROM projects WHERE id=?", p).get("archived"));
    assertFalse((Boolean) db.one("SELECT archived FROM projects WHERE id=?", copy).get("archived"));
    assertTrue(workspace.datasets(copy).isEmpty());
  }

  @Test
  void styleProfilesCannotIncludeBindingsStatisticsOrInvalidAppearance() throws Exception {
    var c = config(1);
    ((ObjectNode) c.path("legend")).put("datasetVersionId", 99);
    c.putObject("publication")
        .put("enabled", false)
        .put("widthMm", 89)
        .put("fontPt", 8)
        .put("dpi", 300)
        .put("datasetVersionId", 99);
    var p = StyleTemplateService.profile(c);
    StyleTemplateService.validateProfile(p);
    assertFalse(p.has("datasetVersionId"));
    assertFalse(p.path("legend").has("datasetVersionId"));
    assertFalse(p.path("publication").has("datasetVersionId"));
    assertFalse(p.path("style").has("title"));
    assertFalse(p.path("series").get(0).has("y"));
    assertFalse(p.path("axes").path("x").has("log"));
    p.put("datasetVersionId", 1);
    assertThrows(ApiException.class, () -> StyleTemplateService.validateProfile(p));
    p.remove("datasetVersionId");
    ((ObjectNode) p.path("series").get(0)).put("width", 200);
    assertThrows(ApiException.class, () -> StyleTemplateService.validateProfile(p));
  }
}
