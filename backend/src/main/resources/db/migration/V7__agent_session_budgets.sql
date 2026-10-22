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
ALTER TABLE agent_runs
  ADD COLUMN session_id CHAR(36) NULL,
  ADD COLUMN request_hash CHAR(64) NULL,
  ADD COLUMN reservation BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN session_charge BIGINT NOT NULL DEFAULT 0,
  ADD INDEX agent_session (project_id, session_id, created_at);
