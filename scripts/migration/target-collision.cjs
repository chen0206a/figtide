// Test-only: prepare/check a conflicting project in the owned temporary desktop.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const arg = key => process.argv[process.argv.indexOf('--' + key) + 1];
const api = arg('api'), file = arg('out');
const name = '研'.repeat(120), description = 'target collision fixture must stay unchanged';
(async () => {
  assert(new URL(api).hostname === '127.0.0.1');
  if (process.argv.includes('--verify')) {
    const before = JSON.parse(fs.readFileSync(file, 'utf8'));
    const projects = await (await fetch(api + '/api/projects')).json();
    const after = projects.find(p => p.id === before.id);
    assert(after); assert.equal(after.name, name); assert.equal(after.description, description);
    assert.equal(after.chart_count, 0); assert.equal(after.dataset_count, 0);
  } else {
    const response = await fetch(api + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
    if (!response.ok) throw new Error(await response.text());
    const project = await response.json();
    assert(project); fs.writeFileSync(file, JSON.stringify(project));
  }
  console.log('Target collision fixture verified');
})().catch(e => { console.error(e); process.exitCode = 1; });
