'use strict';
// 任务 14-3-3：备份清单的规范化 + 往返比较。
//
// 规则（来自任务书）：
//  - 去掉所有数据库 ID；引用改用稳定键：
//      数据版本 = 数据集名 + 版本号 + SHA-256
//      图表     = 图表名
//      实验     = 实验名 + 创建时间
//  - 图表配置里的 datasetVersionId、source_meta_json 里的各种 ID 引用都替换成稳定键；
//  - 项目自身的 created_at 不比较（恢复时会重置为当前时间，已知行为），其余时间一致；
//  - 原始文件比较 SHA-256，同时核对字节长度；
//  - 备份导出的 created_at（导出时刻）不比较。
// 本模块是纯函数：不发起任何网络/磁盘操作，单测见 normalize.test.cjs。

const crypto = require('node:crypto');

function fail(message) {
  throw new Error(`备份清单规范化失败：${message}`);
}

/** manifest 里的 JSON 列是「JSON 字符串」（Jackson valueToTree(String)），null 保持 null。 */
function parseJsonColumn(value, context) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value.length === 0) return null;
    try {
      return JSON.parse(value);
    } catch (e) {
      fail(`${context} 不是合法 JSON：${e.message}`);
    }
  }
  return value;
}

/** 递归排序对象键，得到与键序无关的可比较结构（数组顺序保留）。 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function stableString(value) {
  return JSON.stringify(canonicalize(value));
}

/** 数组视为集合：排序后比较（实验-数据链接这类多对多关系没有顺序语义）。 */
function asSortedSet(array, context) {
  if (!Array.isArray(array)) fail(`${context} 应为数组`);
  return array.map(stableString).sort();
}

const iso = (value, context) => {
  if (typeof value !== 'string' || value.length === 0) fail(`${context} 缺少时间字段`);
  return value;
};

const num = (value, context) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${context} 应为数字`);
  return value;
};

function table(manifest, name) {
  const tables = manifest && manifest.tables;
  const rows = tables && tables[name];
  if (!Array.isArray(rows)) fail(`缺少 tables.${name}`);
  return rows;
}

function requireFields(row, fields, context) {
  for (const field of fields) {
    if (!(field in row)) fail(`${context} 缺少字段 ${field}`);
  }
}

/** Duplicate names are legal. Fingerprint duplicate objects (including their history),
 * then number identical copies so multiplicity and references survive ID remapping. */
function stableKeys(rows, baseKey, content, context) {
  const groups = new Map(), keys = new Map();
  for (const row of rows) {
    if (keys.has(row.id)) fail(`${context} ID 重复：${row.id}`);
    keys.set(row.id, null);
    const base = baseKey(row);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(row);
  }
  for (const [base, group] of groups) {
    const copies = new Map();
    for (const row of group) {
      if (group.length === 1) { keys.set(row.id, base); continue; }
      const hash = crypto.createHash('sha256').update(stableString(content(row))).digest('hex');
      const copy = (copies.get(hash) || 0) + 1;
      copies.set(hash, copy);
      keys.set(row.id, `${base}/${hash}/${copy}`);
    }
  }
  return keys;
}

function chartConfig(row, versionKeyById) {
  const config = canonicalize(parseJsonColumn(row.config_json, `chart_versions#${row.id}.config_json`));
  if (config && typeof config.datasetVersionId === 'number') {
    const referenced = versionKeyById.get(config.datasetVersionId);
    if (!referenced) fail(`chart_versions#${row.id} 配置引用了未知 datasetVersionId=${config.datasetVersionId}`);
    config.datasetVersionId = referenced;
  } else if (config && config.datasetVersionId !== undefined && config.datasetVersionId !== null) {
    fail(`chart_versions#${row.id} 配置的 datasetVersionId 不是数字`);
  }
  return config;
}

/**
 * 规范化整份备份清单。manifest 来自旧版导出（A）或桌面版再导出（B），
 * 两边调用同一函数，输出结构可直接深度比较。
 */
function normalizeManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') fail('manifest 不是对象');
  if (manifest.format !== 'labflow-project-v1') fail(`format 不是 labflow-project-v1`);

  const project = manifest.project || {};
  requireFields(project, ['name', 'created_at'], 'project');

  // ---- id → 稳定键 映射 ----
  const datasetKeyById = new Map();
  const datasets = [];
  for (const row of table(manifest, 'datasets')) {
    requireFields(row, ['id', 'name', 'created_at'], 'datasets');
    const key = `d:${row.name}/${iso(row.created_at, 'datasets.created_at')}`;
    if (datasetKeyById.has(row.id) || datasets.some((d) => d.key === key)) {
      fail(`数据集稳定键冲突：${key}`);
    }
    datasetKeyById.set(row.id, key);
    datasets.push({ key, name: row.name, created_at: iso(row.created_at, 'datasets.created_at') });
  }
  datasets.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const experimentKeyById = new Map();
  const experimentsRaw = [];
  for (const row of table(manifest, 'experiments')) {
    requireFields(row, ['id', 'name', 'created_at', 'updated_at', 'revision'], 'experiments');
    const key = `e:${row.name}/${iso(row.created_at, 'experiments.created_at')}`;
    if (experimentKeyById.has(row.id) || experimentsRaw.some((e) => e.key === key)) {
      fail(`实验稳定键冲突：${key}`);
    }
    experimentKeyById.set(row.id, key);
    experimentsRaw.push({ row, key });
  }

  const versionKeyById = new Map();
  const versionRowByKey = new Map();
  for (const row of table(manifest, 'dataset_versions')) {
    requireFields(
      row,
      ['id', 'dataset_id', 'version', 'filename', 'sha256', 'original_file', 'row_count', 'created_at'],
      'dataset_versions'
    );
    const datasetKey = datasetKeyById.get(row.dataset_id);
    if (!datasetKey) fail(`dataset_versions#${row.id} 引用了未知 dataset_id=${row.dataset_id}`);
    const key = `${datasetKey}/v${num(row.version, 'dataset_versions.version')}/${row.sha256}`;
    if (versionKeyById.has(row.id) || versionRowByKey.has(key)) {
      fail(`数据版本稳定键冲突：${key}`);
    }
    versionKeyById.set(row.id, key);
    versionRowByKey.set(key, row);
  }

  const datasetVersions = [];
  for (const row of table(manifest, 'dataset_versions')) {
    const key = versionKeyById.get(row.id);
    const datasetKey = datasetKeyById.get(row.dataset_id);
    const original = Buffer.from(row.original_file, 'base64');
    const originalSha256 = crypto.createHash('sha256').update(original).digest('hex');
    datasetVersions.push({
      key,
      datasetKey,
      version: num(row.version, 'dataset_versions.version'),
      filename: row.filename,
      sha256Column: row.sha256,
      originalSha256,
      originalBytes: original.length,
      fields: canonicalize(parseJsonColumn(row.fields_json, `dataset_versions#${row.id}.fields_json`)),
      rows: canonicalize(parseJsonColumn(row.rows_json, `dataset_versions#${row.id}.rows_json`)),
      warnings: canonicalize(parseJsonColumn(row.warnings_json, `dataset_versions#${row.id}.warnings_json`)),
      row_count: num(row.row_count, 'dataset_versions.row_count'),
      created_at: iso(row.created_at, 'dataset_versions.created_at'),
      parse_rules: canonicalize(
        parseJsonColumn(row.parse_rules_json, `dataset_versions#${row.id}.parse_rules_json`)
      ),
      source_meta: normalizeSourceMeta(
        parseJsonColumn(row.source_meta_json, `dataset_versions#${row.id}.source_meta_json`),
        versionKeyById,
        datasetKeyById,
        experimentKeyById
      ),
    });
  }
  datasetVersions.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const chartRows = table(manifest, 'charts');
  const history = new Map();
  for (const row of table(manifest, 'chart_versions')) {
    if (!history.has(row.chart_id)) history.set(row.chart_id, []);
    history.get(row.chart_id).push(row);
  }
  const chartFields = row => {
    requireFields(row, ['id', 'name', 'revision', 'created_at', 'updated_at'], 'charts');
    return { name: row.name, revision: num(row.revision, 'charts.revision'),
      created_at: iso(row.created_at, 'charts.created_at'), updated_at: iso(row.updated_at, 'charts.updated_at') };
  };
  const chartKeyById = stableKeys(chartRows, row => `c:${row.name}`, row => ({
    ...chartFields(row),
    history: asSortedSet((history.get(row.id) || []).map(v => ({
      version: v.version, schema_version: v.schema_version, created_at: v.created_at,
      dataset: versionKeyById.get(v.dataset_version_id), config: chartConfig(v, versionKeyById),
    })), 'chart history'),
  }), 'charts');
  const charts = chartRows.map(row => ({ key: chartKeyById.get(row.id), ...chartFields(row) }));
  charts.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // ---- 实验（含链接的稳定键集合）----
  const linksByExperiment = new Map();
  for (const row of table(manifest, 'experiment_datasets')) {
    requireFields(row, ['experiment_id', 'dataset_version_id'], 'experiment_datasets');
    const experimentKey = experimentKeyById.get(row.experiment_id);
    const versionKey = versionKeyById.get(row.dataset_version_id);
    if (!experimentKey) fail(`experiment_datasets 引用了未知 experiment_id=${row.experiment_id}`);
    if (!versionKey) fail(`experiment_datasets 引用了未知 dataset_version_id=${row.dataset_version_id}`);
    if (!linksByExperiment.has(experimentKey)) linksByExperiment.set(experimentKey, []);
    linksByExperiment.get(experimentKey).push(versionKey);
  }

  const experiments = experimentsRaw.map(({ row, key }) => ({
    key,
    name: row.name,
    parameters: canonicalize(parseJsonColumn(row.parameters, `experiments#${row.id}.parameters`)),
    metrics: canonicalize(parseJsonColumn(row.metrics, `experiments#${row.id}.metrics`)),
    notes: row.notes,
    created_at: iso(row.created_at, 'experiments.created_at'),
    updated_at: iso(row.updated_at, 'experiments.updated_at'),
    status: row.status === undefined ? null : row.status,
    tags: canonicalize(parseJsonColumn(row.tags_json, `experiments#${row.id}.tags_json`)),
    revision: num(row.revision, 'experiments.revision'),
    dataset_version_keys: asSortedSet(
      linksByExperiment.get(key) || [],
      `experiments#${row.id}.dataset_version_keys`
    ),
  }));
  experiments.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // ---- 图表版本（config.datasetVersionId → 稳定键）----
  const chartVersions = [];
  for (const row of table(manifest, 'chart_versions')) {
    requireFields(
      row,
      ['id', 'chart_id', 'dataset_version_id', 'version', 'schema_version', 'config_json', 'created_at'],
      'chart_versions'
    );
    const chartKey = chartKeyById.get(row.chart_id);
    if (!chartKey) fail(`chart_versions#${row.id} 引用了未知 chart_id=${row.chart_id}`);
    const versionKey = versionKeyById.get(row.dataset_version_id);
    if (!versionKey) fail(`chart_versions#${row.id} 引用了未知 dataset_version_id=${row.dataset_version_id}`);
    const config = chartConfig(row, versionKeyById);
    chartVersions.push({
      key: `${chartKey}/v${num(row.version, 'chart_versions.version')}`,
      chartKey,
      version: num(row.version, 'chart_versions.version'),
      schema_version: num(row.schema_version, 'chart_versions.schema_version'),
      dataset_version_key: versionKey,
      config,
      created_at: iso(row.created_at, 'chart_versions.created_at'),
    });
  }
  chartVersions.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // ---- 样式模板 ----
  const styleRows = table(manifest, 'style_templates');
  const templateFields = row => {
    requireFields(row, ['id', 'name', 'schema_version', 'profile_json', 'created_at'], 'style_templates');
    return {
      name: row.name,
      schema_version: num(row.schema_version, 'style_templates.schema_version'),
      profile: canonicalize(parseJsonColumn(row.profile_json, `style_templates#${row.id}.profile_json`)),
      created_at: iso(row.created_at, 'style_templates.created_at'),
    };
  };
  const templateKeys = stableKeys(styleRows, row => `s:${row.name}`, templateFields, 'style_templates');
  const styleTemplates = styleRows.map(row => ({ key: templateKeys.get(row.id), ...templateFields(row) }));
  styleTemplates.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    format: manifest.format,
    project: {
      // project.created_at 不比较（恢复时重置为当前时间，任务书已知行为）。
      name: project.name,
      description: project.description === undefined ? null : project.description,
      archived: project.archived === undefined ? false : project.archived,
    },
    datasets,
    dataset_versions: datasetVersions,
    experiments,
    charts,
    chart_versions: chartVersions,
    style_templates: styleTemplates,
  };
}

/** source_meta_json 的 ID 引用 → 稳定键（两种 kind 的字段都以宽松方式处理）。 */
function normalizeSourceMeta(meta, versionKeyById, datasetKeyById, experimentKeyById) {
  if (meta === null || meta === undefined) return null;
  if (typeof meta !== 'object' || Array.isArray(meta) || typeof meta.kind !== 'string') {
    fail('source_meta_json 结构异常（缺少 kind）');
  }
  const out = canonicalize(meta);
  if (out.source && typeof out.source === 'object') {
    if (typeof out.source.datasetVersionId === 'number') {
      const versionKey = versionKeyById.get(out.source.datasetVersionId);
      if (!versionKey) fail(`source.source.datasetVersionId=${out.source.datasetVersionId} 无法解析`);
      out.source.datasetVersionId = versionKey;
    }
    if (typeof out.source.datasetId === 'number') {
      const datasetKey = datasetKeyById.get(out.source.datasetId);
      if (!datasetKey) fail(`source.source.datasetId=${out.source.datasetId} 无法解析`);
      out.source.datasetId = datasetKey;
    }
  }
  if (typeof out.baseline_id === 'number') {
    const experimentKey = experimentKeyById.get(out.baseline_id);
    if (!experimentKey) fail(`source.baseline_id=${out.baseline_id} 无法解析`);
    out.baseline_id = experimentKey;
  }
  if (Array.isArray(out.experiments)) {
    for (const record of out.experiments) {
      if (!record || typeof record !== 'object') continue;
      if (typeof record.id === 'number') {
        const experimentKey = experimentKeyById.get(record.id);
        if (!experimentKey) fail(`comparison 记录 id=${record.id} 无法解析`);
        record.id = experimentKey;
      }
      delete record.project_id; // 项目级信息，两边必然一致
      if (Array.isArray(record.dataset_version_ids)) {
        record.dataset_version_ids = record.dataset_version_ids.map((id) => {
          const versionKey = versionKeyById.get(id);
          if (!versionKey) fail(`comparison dataset_version_ids 含未知 id=${id}`);
          return versionKey;
        });
      }
      if (Array.isArray(record.datasets)) {
        for (const link of record.datasets) {
          if (!link || typeof link !== 'object') continue;
          if (typeof link.experiment_id === 'number') {
            const experimentKey = experimentKeyById.get(link.experiment_id);
            if (!experimentKey) fail(`comparison datasets.experiment_id=${link.experiment_id} 无法解析`);
            link.experiment_id = experimentKey;
          }
          if (typeof link.dataset_version_id === 'number') {
            const versionKey = versionKeyById.get(link.dataset_version_id);
            if (!versionKey) fail(`comparison datasets.dataset_version_id=${link.dataset_version_id} 无法解析`);
            link.dataset_version_id = versionKey;
          }
        }
      }
    }
  }
  return out;
}

/** 深度比较两份规范化清单，返回差异描述数组（空数组 = 完全一致）。 */
function diffCanonical(a, b, maxDiffs = 50) {
  const diffs = [];
  const short = (value) => {
    const text = JSON.stringify(canonicalize(value));
    if (text === undefined) return String(value);
    return text.length > 120 ? text.slice(0, 117) + '…' : text;
  };
  const walk = (x, y, path) => {
    if (diffs.length >= maxDiffs) return;
    if (x === y) return;
    if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') {
      diffs.push(`${path || '(root)'}：旧=${short(x)} 新=${short(y)}`);
      return;
    }
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!Array.isArray(x) || !Array.isArray(y)) {
        diffs.push(`${path}：类型不一致 旧=${short(x)} 新=${short(y)}`);
        return;
      }
      if (x.length !== y.length) {
        diffs.push(`${path}：长度 旧=${x.length} 新=${y.length}`);
      }
      for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${path}[${i}]`);
      return;
    }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const key of keys) {
      walk(x[key], y[key], path ? `${path}.${key}` : key);
    }
  };
  walk(a, b, '');
  return diffs;
}

module.exports = { normalizeManifest, diffCanonical, canonicalize, stableString };
