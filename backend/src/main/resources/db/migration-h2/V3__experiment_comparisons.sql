-- H2 版：对应 MySQL 的 V3__experiment_comparisons.sql。改动：第 1-3 行的单条多列 ADD COLUMN（status/tags_json/revision）拆成 3 条独立 ALTER（H2 不支持单条 ALTER 混合多列）；tags_json、source_meta_json JSON→CLOB。experiment_datasets 建表原样。
ALTER TABLE experiments ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'planned';
ALTER TABLE experiments ADD COLUMN tags_json CLOB NULL;
ALTER TABLE experiments ADD COLUMN revision INT NOT NULL DEFAULT 1;
CREATE TABLE experiment_datasets (
 experiment_id BIGINT NOT NULL,
 dataset_version_id BIGINT NOT NULL,
 PRIMARY KEY(experiment_id,dataset_version_id),
 FOREIGN KEY(experiment_id) REFERENCES experiments(id),
 FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions(id)
);
ALTER TABLE dataset_versions ADD COLUMN source_meta_json CLOB NULL;
