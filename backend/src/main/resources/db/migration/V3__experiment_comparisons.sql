ALTER TABLE experiments ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'planned',
 ADD COLUMN tags_json JSON NULL,
 ADD COLUMN revision INT NOT NULL DEFAULT 1;
CREATE TABLE experiment_datasets (
 experiment_id BIGINT NOT NULL,
 dataset_version_id BIGINT NOT NULL,
 PRIMARY KEY(experiment_id,dataset_version_id),
 FOREIGN KEY(experiment_id) REFERENCES experiments(id),
 FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions(id)
);
ALTER TABLE dataset_versions ADD COLUMN source_meta_json JSON NULL;
