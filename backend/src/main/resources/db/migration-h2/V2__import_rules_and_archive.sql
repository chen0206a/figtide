-- H2 版：对应 MySQL 的 V2__import_rules_and_archive.sql。改动：parse_rules_json JSON→CLOB。单列 ADD COLUMN 实测支持，语句结构原样保留。
ALTER TABLE dataset_versions ADD COLUMN parse_rules_json CLOB NULL;
ALTER TABLE projects ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
