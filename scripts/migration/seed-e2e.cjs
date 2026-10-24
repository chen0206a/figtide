'use strict';
// 14-3-4 代表性种子：在旧版（--api 指定）构造任务书要求的代表性项目。
// 项目：
//   1) 基础图表：多版本数据集、多版本折线图（2 个版本）、ROC 图、混淆矩阵图、
//      派生数据集（data_processing source_meta）、样式模板；
//   2) 实验：两个实验 + 数据集链接 + 实验对比快照（experiment_comparison source_meta）+ 图表；
//   3) 归档项目：中文名 + 特殊字符 + 已归档；
//   4) 大项目：随机字母数字 CSV 多个数据集/版本，备份接近旧版 64 MiB 压缩上限。
// 用法：node scripts/migration/seed-e2e.cjs --api http://127.0.0.1:8087 [--big-mb 30] [--out <summary.json>]
const fs = require('node:fs');
const path = require('node:path');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const API = arg('api');
if (!API || API === true) {
  console.error('用法：node seed-e2e.cjs --api http://127.0.0.1:8087');
  process.exit(2);
}
const BIG_MB = Number(arg('big-mb', '30'));
const OUT = arg('out', undefined);
const base = API.replace(/\/+$/, '');

// 固定种子的伪随机（可复现）：mulberry32。
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const configTemplate = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'src', 'test', 'resources', 'config-v1.json'), 'utf8'));

function clone(t) { return JSON.parse(JSON.stringify(t)); }

async function j(method, apiPath, body) {
  const res = await fetch(base + apiPath, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${apiPath} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function uploadCsv(p, csv, filename, versionOf) {
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), filename);
  const url = versionOf === undefined
    ? `${base}/api/projects/${p}/datasets`
    : `${base}/api/projects/${p}/datasets/${versionOf}/versions`;
  const res = await fetch(url, { method: 'POST', body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${filename} -> ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function chartConfig(datasetVersionId) {
  const c = clone(configTemplate);
  c.datasetVersionId = datasetVersionId;
  c.series[0].y = 'accuracy';
  c.series[0].error = '';
  return c;
}

// ROC / 混淆矩阵需要带 label / 各模型 prediction 列的数据。
const CLASS_CSV =
  'id,label,predA,predB,epoch\n' +
  '1,1,1,1,1\n2,0,1,0,1\n3,1,0,1,2\n4,0,0,0,2\n5,1,1,0,3\n6,1,0,1,3\n7,0,0,0,4\n8,0,1,0,4\n' +
  '9,1,1,1,5\n10,0,0,1,5\n11,1,0,1,6\n12,0,1,0,6\n';

function rocConfig(datasetVersionId) {
  const c = chartConfig(datasetVersionId);
  c.type = 'roc';
  c.series[0].y = 'label';
  c.series[0].prediction = 'predA';
  c.evaluation = {
    algorithm: 'binary-ranking-v1', missing: 'exclude', label: 'label', positive: '1',
    threshold: 0.5, baseline: true, rocXTitle: '', rocYTitle: '', prXTitle: '', prYTitle: '',
  };
  return c;
}

function confusionConfig(datasetVersionId) {
  const c = chartConfig(datasetVersionId);
  c.type = 'confusion';
  const a = c.series[0];
  a.y = 'label';
  a.error = '';
  a.prediction = 'predA';
  const b = clone(a);
  b.id = 'b';
  b.prediction = 'predB';
  c.series.push(b);
  c.classification = {
    algorithm: 'classification-v1', label: 'label', positive: '1', input: 'labels',
    normalization: 'count', threshold: 0.5, xTitle: 'Pred', yTitle: 'True',
    seriesId: 's1', groupValue: '', classes: ['0', '1'],
  };
  c.sampling = { policy: 'independent', id: 'id' };
  return c;
}

// 单个数据集最多 20000 行（旧版导入上限）。生成多个 20000 行的随机字母数字 CSV，
// 合计约 30 MiB 原始数据 → 备份（b64+rows_json 再 zip）接近但不超过旧版 64 MiB 上限。
const MAX_ROWS = 20000;
function bigCsv(seed) {
  const cols = 8;
  const cellLen = 16;
  const rnd = rng(seed);
  const header = Array.from({ length: cols }, (_, i) => `c${i}`).join(',') + '\n';
  const chunks = [header];
  const cell = () => {
    let s = '';
    for (let i = 0; i < cellLen; i++) s += ALNUM[Math.floor(rnd() * ALNUM.length)];
    return s;
  };
  for (let r = 0; r < MAX_ROWS; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) cells.push(cell());
    chunks.push(cells.join(',') + '\n');
  }
  return chunks.join('');
}

async function main() {
  const summary = { api: base, big_mb: BIG_MB, projects: [] };
  const csv =
    'model,epoch,seed,accuracy\nA,2,1,4\nA,1,1,1\nA,1,2,2\nA,1,3,3\nA,1,4,\nA,2,2,6\nB,1,1,3\nB,2,1,5\n';

  // 1) 基础：多版本数据集 + 多版本图表 + ROC + 混淆 + 派生 + 样式模板
  const p1 = (await j('POST', '/api/projects', { name: '代表·图表全家福', description: 'rep charts' })).id;
  const d1 = await uploadCsv(p1, csv, 'run.csv');
  const v1 = d1.id;
  const d1b = await uploadCsv(p1, csv + 'B,2,2,7\n', 'run.csv', d1.dataset_id);
  // 多版本折线图：POST 创建 revision 1，PUT 提升到 revision 2
  const line1 = await j('POST', `/api/projects/${p1}/charts`, { name: '准确率曲线', config: chartConfig(v1) });
  await j('PUT', `/api/projects/${p1}/charts/${line1.id}`, { name: '准确率曲线', revision: line1.revision, config: chartConfig(v1) });
  // ROC 图 + 混淆矩阵图（同 CLASS_CSV 数据集）
  const dc = await uploadCsv(p1, CLASS_CSV, 'classification.csv');
  await j('POST', `/api/projects/${p1}/charts`, { name: 'ROC 曲线', config: rocConfig(dc.id) });
  await j('POST', `/api/projects/${p1}/charts`, { name: '混淆矩阵', config: confusionConfig(dc.id) });
  // 派生数据集（data_processing source_meta）
  await j('POST', `/api/projects/${p1}/data/${d1b.id}/process`, {
    name: '均值与 SEM · synthetic',
    rules: {
      schema_version: 1, mode: 'aggregate', groupBy: ['model', 'epoch'], metrics: ['accuracy'],
      filters: [], sort: [{ field: 'epoch', direction: 'asc' }], missingGroup: 'include',
      error: 'sem', observationUnit: 'independent seed at fixed epoch', replicate: 'seed',
      x: 'epoch', group: 'model', display: 'band',
    },
  });
  await j('POST', `/api/projects/${p1}/style-templates`, { name: '论文样式', config: chartConfig(v1) });
  summary.projects.push({ name: '代表·图表全家福', id: p1 });

  // 2) 实验 + 数据链接 + 实验对比快照
  const p2 = (await j('POST', '/api/projects', { name: 'rep-experiments', description: 'exp' })).id;
  const d2 = await uploadCsv(p2, csv, 'metrics.csv');
  const e1 = await j('POST', `/api/projects/${p2}/experiments`, {
    name: 'baseline', parameters: { lr: 0.1 }, metrics: { accuracy: 0.85 }, notes: 'n',
    status: 'completed', tags: ['a', 'b'], dataset_version_ids: [d2.id],
  });
  const e2 = await j('POST', `/api/projects/${p2}/experiments`, {
    name: 'tuned', parameters: { lr: 0.01 }, metrics: { accuracy: 0.91 }, notes: 'n2',
    status: 'planned', tags: [], dataset_version_ids: [d2.id],
  });
  await j('POST', `/api/projects/${p2}/comparisons`, {
    experiments: [{ id: e1.id, revision: e1.revision }, { id: e2.id, revision: e2.revision }],
    baseline_id: e1.id, metric: 'accuracy', direction: 'higher', chart_type: 'bar',
  });
  const c2 = chartConfig(d2.id);
  const chart2 = await j('POST', `/api/projects/${p2}/charts`, { name: 'chart one', config: c2 });
  await j('PUT', `/api/projects/${p2}/charts/${chart2.id}`, { name: 'chart one', revision: chart2.revision, config: c2 });
  summary.projects.push({ name: 'rep-experiments', id: p2 });

  // 3) 归档 + 中文特殊字符
  const p3 = (await j('POST', '/api/projects', { name: '归档项目/特殊·字符「α」', description: 'archived' })).id;
  const d3 = await uploadCsv(p3, csv, 'old.csv');
  await j('POST', `/api/projects/${p3}/charts`, { name: '旧图', config: chartConfig(d3.id) });
  await j('PUT', `/api/projects/${p3}`, { name: '归档项目/特殊·字符「α」', description: 'archived', archived: true });
  summary.projects.push({ name: '归档项目/特殊·字符「α」', id: p3, archived: true });

  // 4) 大项目：接近 64 MiB 的备份（11 个 20000 行数据集 ≈ 30 MiB 原始数据）
  const p4 = (await j('POST', '/api/projects', { name: 'rep-大项目', description: 'big' })).id;
  const uploads = 11;
  for (let i = 0; i < uploads; i++) {
    await uploadCsv(p4, bigCsv(1234 + i), `big-${i + 1}.csv`);
  }
  summary.projects.push({ name: 'rep-大项目', id: p4, datasets: uploads, rows_per_dataset: MAX_ROWS });

  if (OUT) fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error('seed 失败：', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
