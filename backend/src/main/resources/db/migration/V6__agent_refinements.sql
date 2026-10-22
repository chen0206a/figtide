ALTER TABLE agent_runs
  ADD COLUMN parent_run_id CHAR(36) NULL,
  ADD INDEX agent_parent (project_id, parent_run_id, status);
-- Lineage is retained as an identifier without storing prompts or raw configurations.
-- Project ownership is checked transactionally; project deletion still cascades all runs.
