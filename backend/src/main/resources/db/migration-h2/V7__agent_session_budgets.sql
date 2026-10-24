-- H2 版：对应 MySQL 的 V7__agent_session_budgets.sql。改动：原第 14-19 行的一条 ALTER 混合 4 个 ADD COLUMN + ADD INDEX 拆成 4 条独立 ALTER 和 1 条 CREATE INDEX（H2 不支持混合多列 ALTER）。agent_sessions 建表原样。
CREATE TABLE agent_sessions (
  session_id CHAR(36) PRIMARY KEY,
  project_id BIGINT NOT NULL,
  chart_id BIGINT NULL,
  dataset_version_id BIGINT NOT NULL,
  max_budget BIGINT NOT NULL,
  used_budget BIGINT NOT NULL DEFAULT 0,
  reserved_budget BIGINT NOT NULL DEFAULT 0,
  reported_tokens BIGINT NOT NULL DEFAULT 0,
  uncertain_runs INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
ALTER TABLE agent_runs ADD COLUMN session_id CHAR(36) NULL;
ALTER TABLE agent_runs ADD COLUMN request_hash CHAR(64) NULL;
ALTER TABLE agent_runs ADD COLUMN reservation BIGINT NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN session_charge BIGINT NOT NULL DEFAULT 0;
CREATE INDEX agent_session ON agent_runs (project_id, session_id, created_at);
