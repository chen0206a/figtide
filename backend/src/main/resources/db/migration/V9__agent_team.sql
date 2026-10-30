ALTER TABLE agent_runs ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT 'single';
ALTER TABLE agent_runs ADD COLUMN review_json JSON NULL;
ALTER TABLE agent_runs ADD COLUMN accepted_fixes_json JSON NULL;
