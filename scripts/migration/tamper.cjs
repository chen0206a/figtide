'use strict';
// 14-3-4 故障路径：通过 API 篡改桌面版上某个已迁移项目的一条图表
// （改名 + 乐观锁 revision 递增），使 --verify 重新核对时发现差异并失败退出。
// 用法：node scripts/migration/tamper.cjs --api http://127.0.0.1:17870 --project rep-experiments
const arg = (name) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const base = (arg('api') || '').replace(/\/+$/, '');
const projectName = arg('project');
if (!base || !projectName) {
  console.error('用法：node tamper.cjs --api <desktop-url> --project <项目名>');
  process.exit(2);
}

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

async function main() {
  const projects = await j('GET', '/api/projects');
  const project = projects.find((p) => p.name === projectName);
  if (!project) throw new Error(`桌面版上找不到项目：${projectName}`);
  const charts = await j('GET', `/api/projects/${project.id}/charts`);
  const chart = charts[0];
  if (!chart) throw new Error(`项目 ${projectName} 没有图表可篡改`);
  const detail = await j('GET', `/api/projects/${project.id}/charts/${chart.id}`);
  const updated = await j('PUT', `/api/projects/${project.id}/charts/${chart.id}`, {
    name: 'tampered chart',
    revision: detail.revision,
    config: detail.config,
  });
  console.log(JSON.stringify({ project: projectName, chart: chart.id, renamed: updated.name, revision: updated.revision }));
}

main().catch((e) => {
  console.error('篡改失败：', e && e.message ? e.message : e);
  process.exitCode = 1;
});
