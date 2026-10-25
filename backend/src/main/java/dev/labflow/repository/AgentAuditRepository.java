package dev.labflow.repository;

import java.time.Duration;
import java.time.Instant;
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
            + " (run_id,project_id,instance_id,chart_id,base_revision,dataset_version_id,source_sha256,snapshot_hash,model,endpoint,prompt_version,catalog_hash,status,outcome,max_steps,max_tokens,timeout_seconds,trace_json,created_at,parent_run_id,session_id,request_hash,reservation,turn_index)"
            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'queued','running',?,?,?, '[]',?,?,?,?,?,?)",
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

  @org.springframework.transaction.annotation.Transactional
  public void recover(String instance) {
    var interrupted =
        db.queryForList(
            "SELECT * FROM agent_runs WHERE status IN ('queued','running') AND instance_id<>?",
            instance);
    for (var row : interrupted) {
      String session = (String) row.get("session_id");
      long project = ((Number) row.get("project_id")).longValue();
      if (session != null) lockSession(project, session);
      // 任务 14-1-3：latency_ms 不再用 TIMESTAMPDIFF(MICROSECOND,…)（MySQL 专属写法，任务书固定要求
      // Java 计算），改为用本行 created_at 与当前时间在 Java 里求毫秒差，作为参数传入；单位仍是毫秒。
      Object created = row.get("created_at");
      long latencyMs =
          created instanceof java.sql.Timestamp t
              ? Duration.between(t.toInstant(), Instant.now()).toMillis()
              : 0L;
      int changed =
          db.update(
              "UPDATE agent_runs SET"
                  + " status='incomplete',outcome='interrupted',reason_code='process_interrupted',usage_complete=FALSE,finished_at=CURRENT_TIMESTAMP(3),latency_ms=?,session_charge=reservation"
                  + " WHERE run_id=? AND status IN ('queued','running') AND instance_id<>?",
              latencyMs,
              row.get("run_id"),
              instance);
      if (changed == 1 && session != null)
        settleSession(
            project,
            session,
            ((Number) row.get("reservation")).longValue(),
            ((Number) row.get("reservation")).longValue(),
            0,
            true);
    }
  }

  public void createSession(long project, String id, Long chart, long dataset, int budget) {
    db.update(
        "INSERT INTO agent_sessions(session_id,project_id,chart_id,dataset_version_id,max_budget)"
            + " VALUES (?,?,?,?,?)",
        id,
        project,
        chart,
        dataset,
        budget);
  }

  public Map<String, Object> session(long project, String id) {
    var rows =
        db.queryForList(
            "SELECT * FROM agent_sessions WHERE project_id=? AND session_id=?", project, id);
    if (rows.isEmpty()) throw new dev.labflow.api.ApiException(404, "会话不存在或不属于当前项目");
    return rows.getFirst();
  }

  public Map<String, Object> lockSession(long project, String id) {
    var rows =
        db.queryForList(
            "SELECT * FROM agent_sessions WHERE project_id=? AND session_id=? FOR UPDATE",
            project,
            id);
    if (rows.isEmpty()) throw new dev.labflow.api.ApiException(404, "会话不存在或不属于当前项目");
    return rows.getFirst();
  }

  public List<Map<String, Object>> sessionRuns(long project, String id) {
    return db.queryForList(
        "SELECT run_id,status,outcome FROM agent_runs WHERE project_id=? AND session_id=? ORDER BY"
            + " created_at DESC,run_id DESC LIMIT 40",
        project,
        id);
  }

  public void reserveSession(long project, String id, int budget) {
    db.update(
        "UPDATE agent_sessions SET turn_count=turn_count+1,reserved_budget=reserved_budget+? WHERE"
            + " project_id=? AND session_id=?",
        budget,
        project,
        id);
  }

  public void settleSession(
      long project, String id, long reserved, long charged, long tokens, boolean uncertain) {
    db.update(
        "UPDATE agent_sessions SET"
            + " reserved_budget=reserved_budget-?,used_budget=used_budget+?,reported_tokens=reported_tokens+?,uncertain_runs=uncertain_runs+?"
            + " WHERE project_id=? AND session_id=?",
        reserved,
        charged,
        tokens,
        uncertain ? 1 : 0,
        project,
        id);
  }

  public void sessionCharge(long project, String id, long charged) {
    db.update(
        "UPDATE agent_runs SET session_charge=? WHERE project_id=? AND run_id=?",
        charged,
        project,
        id);
  }

  public int chartRevision(long project, long chart) {
    // 任务 14-1-3：FOR SHARE 在 H2 2.3.232 实测不支持（docs/desktop/H2-PROBE.md U6），统一改为 FOR UPDATE。
    // 锁变强（排他），但本方法只钉住 revision 基线、在提案事务内不更新 charts 行，语义不变。
    var rows =
        db.queryForList(
            "SELECT revision FROM charts WHERE project_id=? AND id=? FOR UPDATE", project, chart);
    if (rows.isEmpty()) throw new dev.labflow.api.ApiException(409, "源图表已不存在，请重新生成提案");
    return ((Number) rows.getFirst().get("revision")).intValue();
  }
}
