package dev.labflow.api;

import dev.labflow.repository.WorkspaceRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

/**
 * Test-only maintenance hooks. Registered only when the backend starts with {@code
 * --labflow.test-support=true}; a normal local session therefore has no destructive endpoint. The
 * E2E suite uses it to remove the projects it created, so a test run cannot leak rows into the
 * user's real database.
 */
@RestController
@RequestMapping("/api/test")
@ConditionalOnProperty(name = "labflow.test-support", havingValue = "true")
public class TestSupportController {
  private final WorkspaceRepository db;
  private final boolean isolated;

  public TestSupportController(WorkspaceRepository db, @Value("${spring.datasource.url}") String url) {
    this.db = db;
    this.isolated = url.matches("jdbc:mysql://[^/]+/labflow_(test|e2e)(\\?.*)?");
  }

  /** Deletes every project with {@code id > after}, children first (no cascades in the schema). */
  @DeleteMapping("/projects")
  @Transactional
  Map<String, Object> cleanup(
      @RequestParam long after, @RequestHeader(value = "X-LabFlow-Test-Run", required = false) String run) {
    if (!isolated) throw new ApiException(403, "测试清理仅允许用于独立 labflow_test / labflow_e2e 数据库");
    if (!"1".equals(run) || after < 1)
      throw new ApiException(400, "测试清理需要 X-LabFlow-Test-Run: 1 且 after>=1，避免误删全部项目");
    var doomed = db.query("SELECT id,name FROM projects WHERE id>? ORDER BY id", after);
    if (doomed.isEmpty()) return Map.of("deleted", 0, "projects", List.of());
    db.update(
        "DELETE FROM chart_versions WHERE chart_id IN (SELECT id FROM charts WHERE project_id IN"
            + " (SELECT id FROM projects WHERE id>?))",
        after);
    db.update(
        "DELETE FROM charts WHERE project_id IN (SELECT id FROM projects WHERE id>?)", after);
    db.update(
        "DELETE FROM experiment_datasets WHERE experiment_id IN (SELECT id FROM experiments WHERE"
            + " project_id IN (SELECT id FROM projects WHERE id>?))",
        after);
    db.update(
        "DELETE FROM dataset_versions WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id"
            + " IN (SELECT id FROM projects WHERE id>?))",
        after);
    db.update(
        "DELETE FROM datasets WHERE project_id IN (SELECT id FROM projects WHERE id>?)", after);
    db.update(
        "DELETE FROM experiments WHERE project_id IN (SELECT id FROM projects WHERE id>?)", after);
    db.update(
        "DELETE FROM style_templates WHERE project_id IN (SELECT id FROM projects WHERE id>?)",
        after);
    db.update("DELETE FROM projects WHERE id>?", after);
    var result = new LinkedHashMap<String, Object>();
    result.put("deleted", doomed.size());
    result.put("projects", doomed.stream().map(row -> row.get("name")).toList());
    return result;
  }
}
