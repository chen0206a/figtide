package dev.labflow.repository;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AgentAuditRepository {
  private final JdbcTemplate db;

  public AgentAuditRepository(JdbcTemplate db) {
    this.db = db;
  }

  public void create(Object... values) {
    db.update(
        "INSERT INTO agent_runs"
            + " (run_id,project_id,instance_id,chart_id,base_revision,dataset_version_id,source_sha256,snapshot_hash,model,endpoint,prompt_version,catalog_hash,status,outcome,max_steps,max_tokens,timeout_seconds,trace_json,created_at,parent_run_id)"
            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'queued','running',?,?,?, '[]',?,?)",
        values);
  }

  public int finish(Object... values) {
    return db.update(
        "UPDATE agent_runs SET"
            + " status=?,outcome=?,reason_code=?,model=?,steps=?,prompt_tokens=?,completion_tokens=?,tokens=?,budget_used=?,usage_complete=?,latency_ms=?,trace_json=?,proposal_json=?,proposal_hash=?,finished_at=?"
            + " WHERE run_id=? AND project_id=? AND status IN ('queued','running')",
        values);
  }

  public Map<String, Object> find(long project, String id) {
    var rows =
        db.queryForList("SELECT * FROM agent_runs WHERE project_id=? AND run_id=?", project, id);
    if (rows.isEmpty()) throw new dev.labflow.api.ApiException(404, "运行记录不存在或不属于当前项目");
    return rows.getFirst();
  }

  public Map<String, Object> lock(long project, String id) {
    var rows =
        db.queryForList(
            "SELECT * FROM agent_runs WHERE project_id=? AND run_id=? FOR UPDATE", project, id);
    if (rows.isEmpty()) throw new dev.labflow.api.ApiException(404, "运行记录不存在或不属于当前项目");
    return rows.getFirst();
  }

  public boolean hasActiveChild(long project, String id) {
    return !db.queryForList(
            "SELECT run_id FROM agent_runs WHERE project_id=? AND parent_run_id=? AND status IN"
                + " ('queued','running') LIMIT 1",
            project,
            id)
        .isEmpty();
  }

  public int decide(
      long project, String id, String outcome, String reason, java.sql.Timestamp now) {
    return db.update(
        "UPDATE agent_runs SET outcome=?,decision_reason=?,decision_at=? WHERE project_id=? AND"
            + " run_id=? AND status='proposed' AND outcome='pending'",
        outcome,
        reason,
        now,
        project,
        id);
  }

  public List<Map<String, Object>> list(
      long project, Long chart, String outcome, int limit, int offset) {
    var args = new ArrayList<Object>();
    args.add(project);
    String where = " WHERE project_id=?";
    if (chart != null) {
      where += " AND chart_id=?";
      args.add(chart);
    }
    if (outcome != null && !outcome.isBlank()) {
      where += " AND outcome=?";
      args.add(outcome);
    }
    args.add(limit);
    args.add(offset);
    return db.queryForList(
        "SELECT"
            + " run_id,chart_id,parent_run_id,status,outcome,model,tokens,latency_ms,created_at,finished_at,decision_at"
            + " FROM agent_runs"
            + where
            + " ORDER BY created_at DESC,run_id DESC LIMIT ? OFFSET ?",
        args.toArray());
  }

  public void recover(String instance) {
    db.update(
        "UPDATE agent_runs SET"
            + " status='incomplete',outcome='interrupted',reason_code='process_interrupted',usage_complete=FALSE,finished_at=CURRENT_TIMESTAMP(3),latency_ms=TIMESTAMPDIFF(MICROSECOND,created_at,CURRENT_TIMESTAMP(3))/1000"
            + " WHERE status IN ('queued','running') AND instance_id<>?",
        instance);
  }

  public int chartRevision(long project, long chart) {
    var rows =
        db.queryForList(
            "SELECT revision FROM charts WHERE project_id=? AND id=? FOR SHARE", project, chart);
    if (rows.isEmpty()) throw new dev.labflow.api.ApiException(409, "源图表已不存在，请重新生成提案");
    return ((Number) rows.getFirst().get("revision")).intValue();
  }
}
