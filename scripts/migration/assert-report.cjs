'use strict';
// 14-3-4 断言辅助：校验迁移报告 JSON 的内容，退出码 0/1。
// PowerShell 5.1 读取无 BOM 的 UTF-8 脚本会把中文字面量错误解码，
// 因此所有含中文的断言都放在本文件里（Node 以 UTF-8 读取）。
// 用法：node assert-report.cjs --file <migration-report.json> --mode first|second|verify
const fs = require('node:fs');

const arg = (name) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const file = arg('file');
const mode = arg('mode');
if (!file || !mode || !['first', 'second', 'verify'].includes(mode)) {
  console.error('用法：node assert-report.cjs --file <report.json> --mode first|second|verify');
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const projects = report.projects || [];
const fail = (msg) => {
  console.error('断言失败：' + msg);
  process.exit(1);
};

if (mode === 'first') {
  if (projects.length !== 4) fail(`项目数应为 4，实际 ${projects.length}`);
  for (const p of projects) {
    if (p.result !== '成功') fail(`项目「${p.name}」result=${p.result}，应为 成功`);
    if ((p.diffs || []).length) fail(`项目「${p.name}」不应有差异：${p.diffs[0]}`);
  }
  if (!projects.some((p) => p.name === 'rep-大项目')) fail('缺少大项目 rep-大项目');
  if (!projects.some((p) => p.name === '归档项目/特殊·字符「α」' && p.note !== null && (p.note || '').includes('归档'))) {
    console.log('（提示）归档状态说明：', JSON.stringify(projects.find((p) => p.name.includes('归档'))?.note));
  }
} else if (mode === 'second') {
  if (projects.length !== 4) fail(`项目数应为 4，实际 ${projects.length}`);
  for (const p of projects) {
    if (p.result !== '已迁移') fail(`项目「${p.name}」result=${p.result}，应为 已迁移`);
  }
} else {
  const tampered = projects.find((p) => p.name === 'rep-experiments');
  if (!tampered) fail('缺少 rep-experiments');
  if (tampered.result !== '失败') fail(`rep-experiments result=${tampered.result}，应为 失败`);
  if (!(tampered.diffs || []).length) fail('rep-experiments 应给出差异列表');
}

console.log(`assert-report [${mode}] OK：${projects.map((p) => `${p.name}=${p.result}`).join('，')}`);
