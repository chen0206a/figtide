CREATE TABLE style_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  profile_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
