ALTER TABLE agent_runs ALTER COLUMN dataset_version_id DROP NOT NULL;
ALTER TABLE agent_sessions ALTER COLUMN dataset_version_id DROP NOT NULL;
ALTER TABLE agent_runs ADD COLUMN diagram_id BIGINT NULL;
ALTER TABLE agent_runs ADD COLUMN skill_id VARCHAR(64) NULL;
ALTER TABLE agent_runs ADD COLUMN skill_version VARCHAR(32) NULL;
ALTER TABLE agent_sessions ADD COLUMN diagram_id BIGINT NULL;
CREATE INDEX agent_project_diagram ON agent_runs(project_id,diagram_id,created_at);
