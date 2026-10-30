CREATE TABLE diagrams (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  revision INT NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE diagram_versions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  diagram_id BIGINT NOT NULL,
  version INT NOT NULL,
  schema_version INT NOT NULL,
  doc_json CLOB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  UNIQUE (diagram_id,version),
  FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE
);
