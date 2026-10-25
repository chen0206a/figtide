'use strict';
// 任务 14-3-3：normalize.cjs 纯函数单元测试（node --test scripts/migration/）。
// 覆盖任务书要求：同内容不同 ID → 相等；任何字段/字节/链接差异 → 不相等。
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { normalizeManifest, diffCanonical } = require('./normalize.cjs');

const CSV = 'model,epoch\nA,1\n';
const originalFile = Buffer.from(CSV, 'utf8');
const sha256 = crypto.createHash('sha256').update(originalFile).digest('hex');

/** 一份最小但结构完整的备份清单；shiftId 用于把所有数据库 ID 平移，模拟「旧库导出 vs 桌面版再导出」。 */
function manifest({ shift = 0, mutate = () => {} } = {}) {
  const id = (n) => n + shift * 100;
  const sourceMeta = {
    schema_version: 1,
    kind: 'data_processing',
    algorithm: 'group-summary-v1',
    created_at: '2026-10-01T00:00:00Z',
    source: { datasetVersionId: id(11), datasetId: id(10), version: 1, filename: 'run.csv', sha256 },
    rules: { mode: 'aggregate', groupBy: ['model'] },
    statistics: { rows: 2 },
    counts: { rows: 2 },
  };
  const comparisonMeta = {
    schema_version: 1,
    kind: 'experiment_comparison',
    created_at: '2026-10-01T00:00:00Z',
    metric: 'accuracy',
    direction: 'higher',
    baseline_id: id(31),
    chart_type: 'bar',
    missing_count: 0,
    experiments: [
      {
        id: id(31),
        project_id: id(1),
        name: 'baseline',
        dataset_version_ids: [id(11)],
        datasets: [{ experiment_id: id(31), dataset_version_id: id(11) }],
      },
    ],
  };
  const config = JSON.stringify({
    schema_version: 1,
    datasetVersionId: id(11),
    type: 'line',
    x: 'epoch',
    series: [{ id: 's1', y: 'accuracy', color: '#000', width: 2 }],
    style: { fontSize: 14 },
  });
  const m = {
    format: 'labflow-project-v1',
    created_at: '2026-10-02T00:00:00Z',
    project: { id: id(1), name: 'P', description: 'd', created_at: '2026-09-01T00:00:00Z', archived: false },
    tables: {
      datasets: [{ id: id(10), project_id: id(1), name: 'run', created_at: '2026-09-02T00:00:00Z' }],
      dataset_versions: [
        {
          id: id(11),
          dataset_id: id(10),
          version: 1,
          filename: 'run.csv',
          sha256,
          original_file: originalFile.toString('base64'),
          fields_json: JSON.stringify({ model: 'string', epoch: 'number' }),
          rows_json: JSON.stringify([{ model: 'A', epoch: 1 }]),
          warnings_json: '[]',
          row_count: 1,
          created_at: '2026-09-03T00:00:00Z',
          parse_rules_json: null,
          source_meta_json: JSON.stringify(sourceMeta),
        },
        {
          id: id(12),
          dataset_id: id(10),
          version: 2,
          filename: 'run.csv',
          sha256,
          original_file: originalFile.toString('base64'),
          fields_json: JSON.stringify({ model: 'string', epoch: 'number' }),
          rows_json: JSON.stringify([{ model: 'A', epoch: 1 }]),
          warnings_json: '[]',
          row_count: 1,
          created_at: '2026-09-04T00:00:00Z',
          parse_rules_json: null,
          source_meta_json: JSON.stringify(comparisonMeta),
        },
      ],
      experiments: [
        {
          id: id(31),
          project_id: id(1),
          name: 'baseline',
          parameters: JSON.stringify({ lr: 0.1 }),
          metrics: JSON.stringify({ accuracy: 0.85 }),
          notes: 'n',
          created_at: '2026-09-05T00:00:00Z',
          updated_at: '2026-09-05T00:00:00Z',
          status: 'completed',
          tags_json: JSON.stringify(['a']),
          revision: 1,
        },
      ],
      experiment_datasets: [{ experiment_id: id(31), dataset_version_id: id(11) }],
      charts: [
        {
          id: id(20),
          project_id: id(1),
          name: 'c1',
          revision: 1,
          created_at: '2026-09-06T00:00:00Z',
          updated_at: '2026-09-06T00:00:00Z',
        },
      ],
      chart_versions: [
        {
          id: id(21),
          chart_id: id(20),
          dataset_version_id: id(11),
          version: 1,
          schema_version: 1,
          config_json: config,
          created_at: '2026-09-06T00:00:00Z',
        },
      ],
      style_templates: [
        {
          id: id(40),
          project_id: id(1),
          name: 'tpl',
          schema_version: 1,
          profile_json: JSON.stringify({ schema_version: 1, style: { fontSize: 14 } }),
          created_at: '2026-09-07T00:00:00Z',
        },
      ],
    },
  };
  mutate(m);
  return m;
}

const compare = (a, b) => diffCanonical(normalizeManifest(a), normalizeManifest(b));

test('相同内容、数据库 ID 全部不同 → 相等', () => {
  const diffs = compare(manifest(), manifest({ shift: 1 }));
  assert.deepEqual(diffs, []);
});

test('项目导出时间与项目自身 created_at 不参与比较', () => {
  const a = manifest();
  const b = manifest({ shift: 1 });
  b.created_at = '2030-01-01T00:00:00Z';
  b.project.created_at = '2030-01-01T00:00:00Z';
  assert.deepEqual(compare(a, b), []);
});

test('项目名字段差异 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.project.name = 'Q';
  assert.ok(compare(manifest(), b).some((d) => d.startsWith('project.name：')));
});

test('项目描述差异 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.project.description = 'x';
  assert.ok(compare(manifest(), b).some((d) => d.startsWith('project.description：')));
});

test('数据集名差异 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.tables.datasets[0].name = 'other';
  assert.ok(compare(manifest(), b).length > 0);
});

test('原始文件一个字节不同 → 不相等（SHA-256 + 字节长度）', () => {
  const b = manifest({ shift: 1 });
  const bytes = Buffer.from('model,epoch\nB,1\n', 'utf8');
  b.tables.dataset_versions[0].original_file = bytes.toString('base64');
  b.tables.dataset_versions[0].sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const diffs = compare(manifest(), b);
  assert.ok(diffs.some((d) => d.includes('originalSha256')));
  assert.ok(diffs.some((d) => d.includes('dataset_versions[0].key')));
});

test('sha256 列与原始文件不一致 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.tables.dataset_versions[0].sha256 = '0'.repeat(64);
  assert.ok(compare(manifest(), b).some((d) => d.includes('sha256Column') || d.includes('dataset_versions[0].key')));
});

test('fields_json JSON 列内容差异（键序无关）→ 相等', () => {
  const b = manifest({ shift: 1 });
  // 同一对象不同键序 —— JSON 列比较必须与键序无关
  b.tables.dataset_versions[0].fields_json = JSON.stringify({ epoch: 'number', model: 'string' });
  assert.deepEqual(compare(manifest(), b), []);
});

test('rows_json 内容差异 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.tables.dataset_versions[0].rows_json = JSON.stringify([{ model: 'B', epoch: 1 }]);
  assert.ok(compare(manifest(), b).some((d) => d.startsWith('dataset_versions[0].rows')));
});

test('图表配置差异 → 不相等', () => {
  const b = manifest({ shift: 1 });
  const cfg = JSON.parse(b.tables.chart_versions[0].config_json);
  cfg.style.fontSize = 20;
  b.tables.chart_versions[0].config_json = JSON.stringify(cfg);
  assert.ok(compare(manifest(), b).some((d) => d.includes('fontSize')));
});

test('图表改重命名 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.tables.charts[0].name = 'c2';
  assert.ok(compare(manifest(), b).some((d) => d.startsWith('charts[0].key')));
});

test('实验链接数量差异 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.tables.experiment_datasets = [];
  assert.ok(compare(manifest(), b).some((d) => d.startsWith('experiments[0].dataset_version_keys')));
});

test('实验参数差异 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.tables.experiments[0].parameters = JSON.stringify({ lr: 0.01 });
  assert.ok(compare(manifest(), b).some((d) => d.startsWith('experiments[0].parameters')));
});

test('样式模板 profile 差异 → 不相等', () => {
  const b = manifest({ shift: 1 });
  b.tables.style_templates[0].profile_json = JSON.stringify({ schema_version: 1, style: { fontSize: 9 } });
  assert.ok(compare(manifest(), b).some((d) => d.startsWith('style_templates[0].profile')));
});

test('source_meta（data_processing）的 ID 引用重映射 → 相等', () => {
  // A 用 id=11；B 平移后同一版本 id=111 —— 规范化后都变成同一个稳定键。
  const a = manifest();
  const b = manifest({ shift: 1 });
  const metaB = JSON.parse(b.tables.dataset_versions[0].source_meta_json);
  assert.equal(metaB.source.datasetVersionId, 111); // 前提：B 的引用确实换了 ID
  assert.deepEqual(compare(a, b), []);
});

test('source_meta（experiment_comparison）的 ID 引用重映射 → 相等', () => {
  const a = manifest();
  const b = manifest({ shift: 1 });
  const metaB = JSON.parse(b.tables.dataset_versions[1].source_meta_json);
  assert.equal(metaB.baseline_id, 131); // 前提：B 的 baseline_id 换了 ID
  assert.deepEqual(compare(a, b), []);
});

test('source_meta 数据集引用指向不同版本 → 不相等', () => {
  const b = manifest({ shift: 1 });
  const meta = JSON.parse(b.tables.dataset_versions[0].source_meta_json);
  meta.source.datasetVersionId = 112; // 平移后的另一个版本
  b.tables.dataset_versions[0].source_meta_json = JSON.stringify(meta);
  assert.ok(compare(manifest(), b).some((d) => d.includes('dataset_versions[0].source_meta')));
});

test('图表配置 datasetVersionId 引用重映射 → 相等', () => {
  const a = manifest();
  const b = manifest({ shift: 1 });
  const cfg = JSON.parse(b.tables.chart_versions[0].config_json);
  assert.equal(cfg.datasetVersionId, 111); // 前提：B 的配置引用换了 ID
  assert.deepEqual(compare(a, b), []);
});

test('图表配置指向不同数据版本 → 不相等', () => {
  const b = manifest({ shift: 1 });
  const cfg = JSON.parse(b.tables.chart_versions[0].config_json);
  cfg.datasetVersionId = 112;
  b.tables.chart_versions[0].config_json = JSON.stringify(cfg);
  assert.ok(compare(manifest(), b).some((d) => d.startsWith('chart_versions[0].config.datasetVersionId')));
});

test('数据集稳定键冲突（同名同创建时间）→ 抛错', () => {
  const a = manifest();
  a.tables.datasets.push({ ...a.tables.datasets[0], id: 99 });
  assert.throws(() => normalizeManifest(a), /稳定键冲突/);
});

test('引用未知 dataset_version_id → 抛错', () => {
  const a = manifest();
  a.tables.experiment_datasets[0].dataset_version_id = 999;
  assert.throws(() => normalizeManifest(a), /未知 dataset_version_id=999/);
});

test('config 引用未知 datasetVersionId → 抛错', () => {
  const a = manifest();
  const cfg = JSON.parse(a.tables.chart_versions[0].config_json);
  cfg.datasetVersionId = 999;
  a.tables.chart_versions[0].config_json = JSON.stringify(cfg);
  assert.throws(() => normalizeManifest(a), /datasetVersionId=999/);
});

test('diffCanonical 截断超长差异并停止在 maxDiffs', () => {
  const a = { list: Array.from({ length: 80 }, (_, i) => i) };
  const b = { list: Array.from({ length: 80 }, () => 'x') };
  const diffs = diffCanonical(a, b, 10);
  assert.equal(diffs.length, 10);
});

function withDuplicates(shift = 0) {
  const m = manifest({ shift });
  const chart = m.tables.charts[0];
  m.tables.charts.push({ ...chart, id: chart.id + 50 });
  const version = m.tables.chart_versions[0];
  m.tables.chart_versions.push({ ...version, id: version.id + 50, chart_id: chart.id + 50 });
  const template = m.tables.style_templates[0];
  m.tables.style_templates.push({ ...template, id: template.id + 50 });
  return m;
}

test('同名且完全相同的图表和模板保留重复数量，ID和行顺序变化仍一致', () => {
  const a = withDuplicates(), b = withDuplicates(3);
  b.tables.charts.reverse(); b.tables.chart_versions.reverse(); b.tables.style_templates.reverse();
  assert.deepEqual(compare(a, b), []);
  const n = normalizeManifest(a);
  assert.equal(n.charts.length, 2);
  assert.equal(new Set(n.charts.map(c => c.key)).size, 2);
  assert.equal(new Set(n.chart_versions.map(c => c.chartKey)).size, 2);
  assert.equal(n.style_templates.length, 2);
});

test('同名不同外观的图表与模板在重排后保持对应', () => {
  const edit = m => {
    const cfg = JSON.parse(m.tables.chart_versions[1].config_json);
    cfg.style.fontSize = 22;
    m.tables.chart_versions[1].config_json = JSON.stringify(cfg);
    m.tables.style_templates[1].profile_json = JSON.stringify({ schema_version: 1, style: { fontSize: 22 } });
  };
  const a = withDuplicates(), b = withDuplicates(3); edit(a); edit(b);
  b.tables.charts.reverse(); b.tables.chart_versions.reverse(); b.tables.style_templates.reverse();
  assert.deepEqual(compare(a, b), []);
});

test('同名图表的任一历史配置变化仍能检出', () => {
  const a = withDuplicates(), b = withDuplicates(3);
  const cfg = JSON.parse(b.tables.chart_versions[1].config_json);
  cfg.style.fontSize = 99;
  b.tables.chart_versions[1].config_json = JSON.stringify(cfg);
  assert.ok(compare(a, b).length > 0);
});

test('同名模板删除一份或修改一份不能被去重掩盖', () => {
  const a = withDuplicates(), b = withDuplicates(3);
  b.tables.style_templates.pop();
  assert.ok(compare(a, b).length > 0);
  const c = withDuplicates(3);
  c.tables.style_templates[1].profile_json = '{"schema_version":1,"style":{"fontSize":99}}';
  assert.ok(compare(a, c).length > 0);
});
