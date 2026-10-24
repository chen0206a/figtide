-- H2 版：对应 MySQL 的 V8__agent_session_order.sql。两条单列 ADD COLUMN 实测 H2 支持，原样保留。
ALTER TABLE agent_sessions ADD COLUMN turn_count INT NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN turn_index INT NOT NULL DEFAULT 0;
