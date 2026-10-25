'use strict';
// 14-3-4 旧库只读校验：对 labflow_e2e 每张表取行数与 CHECKSUM TABLE 值。
// 迁移前后各跑一次，输出 JSON 相同即证明旧库未被修改。
// 用法：node scripts/migration/old-db-check.cjs [--out file.json]
// 环境变量 MYSQL_PWD 须由调用方（PowerShell）导出。
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const TABLES = [
  'projects', 'datasets', 'dataset_versions', 'experiments', 'experiment_datasets',
  'charts', 'chart_versions', 'style_templates', 'agent_runs', 'agent_sessions',
];

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const MYSQL = process.env.LABFLOW_MYSQL_BIN
  ? (process.env.LABFLOW_MYSQL_BIN.endsWith('.exe')
      ? process.env.LABFLOW_MYSQL_BIN
      : require('node:path').join(process.env.LABFLOW_MYSQL_BIN, 'mysql.exe'))
  : 'mysql';
const OUT = arg('out', undefined);

function query(sql) {
  return execFileSync(MYSQL, [
    '--user=root', '--host=127.0.0.1', '--port=33316', '--batch', '--raw', 'labflow_e2e', '-e', sql,
  ], { encoding: 'utf8', env: process.env }).trim();
}

function main() {
  const counts = {};
  const checksums = {};
  for (const t of TABLES) {
    counts[t] = Number(query(`SELECT COUNT(*) FROM ${t};`).split('\n').pop());
  }
  const cs = query(`CHECKSUM TABLE ${TABLES.join(', ')};`);
  for (const line of cs.split('\n')) {
    const cells = line.split('\t');
    if (cells.length === 2) checksums[cells[0]] = cells[1];
  }
  const result = { at: new Date().toISOString(), counts, checksums };
  const text = JSON.stringify(result, null, 2);
  if (OUT) fs.writeFileSync(OUT, text);
  console.log(text);
}

try {
  main();
} catch (e) {
  console.error('旧库只读校验失败：', e && e.message ? e.message : e);
  process.exitCode = 1;
}
