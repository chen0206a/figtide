-- H2 版：对应 MySQL 的 V6__agent_refinements.sql。改动：原第 1-3 行的一条 ALTER 混合 ADD COLUMN + ADD INDEX 拆成两步（H2 不支持该混合形态）。
ALTER TABLE agent_runs ADD COLUMN parent_run_id CHAR(36) NULL;
CREATE INDEX agent_parent ON agent_runs (project_id, parent_run_id, status);
-- Lineage is retained as an identifier without storing prompts or raw configurations.
-- Project ownership is checked transactionally; project deletion still cascades all runs.
