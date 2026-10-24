// Local subprocess smoke: no browser, tray, MySQL or paid provider is involved.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, '.runtime', `launcher-probe-${randomUUID()}`, '中文 空间', 'data');
const portFile = path.join(directory, 'app.port');
const classpath = [path.join(root, '.runtime/desktop-build/classes'), path.join(root, 'backend/target/test-classes'),
  fs.readFileSync(path.join(root, '.runtime/desktop-test-classpath.txt'), 'utf8').trim()].join(path.delimiter);
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java.exe') : 'java';
const children = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const canary = 'local-launcher-test-canary-not-a-real-key';
let preferredPort;
fs.mkdirSync(directory, { recursive: true });
function start() {
  const log = path.join(directory, `process-${children.length}.log`);
  const fd = fs.openSync(log, 'w');
  const child = spawn(java, ['-Duser.timezone=UTC', '-cp', classpath, 'dev.labflow.desktop.LauncherProcessProbe',
    '--spring.profiles.active=desktop', `--labflow.data-dir=${directory}`,
    ...(children.length === 0 ? [`--labflow.desktop.port=${preferredPort}`] : []),
    '--labflow.desktop.open-browser=false', '--labflow.desktop.tray=false'], {
    cwd: root, windowsHide: true, stdio: ['pipe', fd, fd],
    env: { ...process.env, LABFLOW_AGENT_API_KEY: canary, LABFLOW_AGENT_MODEL: 'local-probe', LABFLOW_AGENT_BASE_URL: 'http://127.0.0.1:1' },
  });
  fs.closeSync(fd); children.push(child); return child;
}
async function ready(child, previousId) {
  for (let i = 0; i < 160; i++) {
    if (child.exitCode !== null) throw Error(`Launcher exited ${child.exitCode}; inspect ${directory}`);
    try {
      const record = JSON.parse(fs.readFileSync(portFile, 'utf8'));
      if (record.instance_id !== previousId) {
        const response = await fetch(`http://127.0.0.1:${record.port}/api/desktop/ping`, { signal: AbortSignal.timeout(1000) });
        if (response.ok && (await response.json()).instance_id === record.instance_id) return record;
      }
    } catch { }
    await delay(200);
  }
  throw Error(`Launcher did not become ready; inspect ${directory}`);
}
async function exited(child) {
  for (let i = 0; i < 150 && child.exitCode === null; i++) await delay(100);
  assert.notEqual(child.exitCode, null, 'child must exit');
  assert.equal(child.exitCode, 0);
}
async function close(child) { child.stdin.end('x'); await exited(child); assert.equal(fs.existsSync(portFile), false); }
async function projects(record) {
  const response = await fetch(`http://127.0.0.1:${record.port}/api/projects`);
  assert(response.ok); return response.json();
}
(async () => {
  const net = require('node:net');
  for (preferredPort = 17870; preferredPort < 17970; preferredPort++) {
    const probe = net.createServer();
    try { await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(preferredPort, '127.0.0.1', resolve); }); }
    catch { continue; }
    await new Promise(resolve => probe.close(resolve)); break;
  }
  assert(preferredPort < 17970);
  const first = start(), a = await ready(first);
  assert.equal(a.port, preferredPort);
  const preferenceFile = path.join(directory, 'desktop.json');
  const preference = fs.readFileSync(preferenceFile, 'utf8');
  assert.equal(JSON.parse(preference).preferred_port, preferredPort);
  const base = `http://127.0.0.1:${a.port}`;
  // Node fetch normalizes Host; use the raw HTTP client so the attack header is actually sent.
  const badHost = await new Promise((resolve, reject) => {
    const req = require('node:http').get(`${base}/api/desktop/ping`, { headers: { Host: `attacker.example:${a.port}` } }, response => {
      response.resume(); resolve(response.statusCode);
    }); req.on('error', reject);
  });
  assert.equal(badHost, 403);
  assert.equal((await fetch(`${base}/api/projects`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${a.port + 1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'must not be created', description: '' }) })).status, 403);
  const accepted = await fetch(`${base}/api/projects`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'same-origin probe', description: 'Synthetic local test' }) });
  assert(accepted.ok);
  const home = await fetch(`http://127.0.0.1:${a.port}/projects/3/figures/7`);
  assert.match(await home.text(), /FigTide/);
  const created = await fetch(`http://127.0.0.1:${a.port}/api/projects`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'launcher persistence probe', description: 'Synthetic local test' }) });
  assert(created.ok); const project = await created.json();
  const form = new FormData();
  form.append('file', new Blob(['epoch,accuracy,error\n1,0.700,0.010\n2,0.850,0.020\n'], { type: 'text/csv' }), 'synthetic-launcher.csv');
  const uploaded = await fetch(`${base}/api/projects/${project.id}/datasets`, { method: 'POST', body: form });
  assert(uploaded.ok); const dataset = await uploaded.json();
  const config = JSON.parse(fs.readFileSync(path.join(root, 'backend/src/test/resources/config-v1.json'), 'utf8'));
  config.datasetVersionId = dataset.id;
  const saved = await fetch(`${base}/api/projects/${project.id}/charts`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Saved launcher probe figure', config }) });
  assert(saved.ok); const chart = await saved.json();
  const second = start(); await exited(second);
  assert.equal(first.exitCode, null); assert.equal(JSON.parse(fs.readFileSync(portFile, 'utf8')).instance_id, a.instance_id);
  await close(first);
  const third = start(), b = await ready(third, a.instance_id);
  assert.equal(b.port, a.port, 'normal restart keeps the origin');
  assert((await projects(b)).some(p => p.id === project.id));
  const reopened = await (await fetch(`http://127.0.0.1:${b.port}/api/projects/${project.id}/charts/${chart.id}`)).json();
  assert.deepEqual(reopened.config, config);
  config.style.title = 'Saved immediately before forced exit';
  const edited = await fetch(`http://127.0.0.1:${b.port}/api/projects/${project.id}/charts/${chart.id}`, { method: 'PUT',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: chart.name, revision: reopened.revision, config }) });
  assert(edited.ok); const updated = await edited.json();
  third.kill();
  await new Promise(resolve => third.once('exit', resolve));
  assert(fs.existsSync(portFile), 'forced exit leaves a stale record');
  const fourth = start(), c = await ready(fourth, b.instance_id);
  assert.equal(c.port, a.port, 'forced restart keeps the origin');
  assert((await projects(c)).some(p => p.id === project.id));
  const recovered = await (await fetch(`http://127.0.0.1:${c.port}/api/projects/${project.id}/charts/${chart.id}`)).json();
  assert.deepEqual(recovered.config, config);
  assert.equal(recovered.revision, updated.revision);
  await close(fourth);
  const blocker = net.createServer();
  await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(preferredPort, '127.0.0.1', resolve); });
  let fallback;
  try {
    const fifth = start(); fallback = await ready(fifth, c.instance_id);
    assert.notEqual(fallback.port, preferredPort);
    assert.equal(fs.readFileSync(preferenceFile, 'utf8'), preference, 'fallback must not modify desktop.json');
    await close(fifth);
  } finally { await new Promise(resolve => blocker.close(resolve)); }
  const sixth = start(), d = await ready(sixth, fallback.instance_id);
  assert.equal(d.port, preferredPort, 'next run retries the original preference');
  assert.equal(fs.readFileSync(preferenceFile, 'utf8'), preference);
  await close(sixth);
  const logs = path.join(path.dirname(directory), 'logs');
  assert(fs.existsSync(path.join(logs, 'figtide.log')));
  assert(fs.readFileSync(path.join(logs, 'figtide.log'), 'utf8').includes('端口被占用，本次无法沿用未保存的草稿和页面偏好'));
  for (const file of fs.readdirSync(logs)) assert(!fs.readFileSync(path.join(logs, file), 'utf8').includes(canary), 'API key must not appear in logs');
  const report = { checkedAt: new Date().toISOString(), passed: ['fixed preferred port', 'same-JAR SPA', 'Chinese/spaced path',
    'single instance', 'normal exit removes port', 'normal restart persists', 'forced restart persists', 'rotating log location', 'no model key in logs',
    'Host attack rejected', 'cross-port Origin rejected', 'same-origin write accepted',
    'saved figure normal reopen', 'last-saved figure after forced exit', 'stable origin across restarts',
    'occupied port falls back', 'fallback preserves desktop.json', 'next launch retries preferred port', 'fallback warning logged'],
    dataDirectory: path.relative(root, directory), ports: [a.port, b.port, c.port, fallback.port, d.port] };
  fs.writeFileSync(path.join(root, '.runtime/desktop-launcher-probe.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const child of children) if (child.exitCode === null && !child.killed) child.kill();
});
