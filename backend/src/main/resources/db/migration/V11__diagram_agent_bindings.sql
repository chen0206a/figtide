ALTER TABLE agent_runs MODIFY COLUMN dataset_version_id BIGINT NULL;
ALTER TABLE agent_sessions MODIFY COLUMN dataset_version_id BIGINT NULL;
ALTER TABLE agent_runs ADD COLUMN diagram_id BIGINT NULL;
ALTER TABLE agent_runs ADD COLUMN skill_id VARCHAR(64) NULL;
ALTER TABLE agent_runs ADD COLUMN skill_version VARCHAR(32) NULL;
ALTER TABLE agent_sessions ADD COLUMN diagram_id BIGINT NULL;
CREATE INDEX agent_project_diagram ON agent_runs(project_id,diagram_id,created_at);
