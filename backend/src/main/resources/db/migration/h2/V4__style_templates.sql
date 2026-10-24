-- H2 版：对应 MySQL 的 V4__style_templates.sql。改动：profile_json JSON→CLOB。其余（AUTO_INCREMENT、TIMESTAMP(3) 默认值、外键）原样保留。
CREATE TABLE style_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  profile_json CLOB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
