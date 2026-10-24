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
fs.mkdirSync(directory, { recursive: true });
function start() {
  const log = path.join(directory, `process-${children.length}.log`);
  const fd = fs.openSync(log, 'w');
  const child = spawn(java, ['-Duser.timezone=UTC', '-cp', classpath, 'dev.labflow.desktop.LauncherProcessProbe',
    '--spring.profiles.active=desktop', `--labflow.data-dir=${directory}`,
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
  const first = start(), a = await ready(first);
  assert(a.port > 0); assert.notEqual(a.port, 8086);
  const home = await fetch(`http://127.0.0.1:${a.port}/projects/3/figures/7`);
  assert.match(await home.text(), /FigTide/);
  const created = await fetch(`http://127.0.0.1:${a.port}/api/projects`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'launcher persistence probe', description: 'Synthetic local test' }) });
  assert(created.ok); const project = await created.json();
  const second = start(); await exited(second);
  assert.equal(first.exitCode, null); assert.equal(JSON.parse(fs.readFileSync(portFile, 'utf8')).instance_id, a.instance_id);
  await close(first);
  const third = start(), b = await ready(third, a.instance_id);
  assert((await projects(b)).some(p => p.id === project.id));
  third.kill();
  await new Promise(resolve => third.once('exit', resolve));
  assert(fs.existsSync(portFile), 'forced exit leaves a stale record');
  const fourth = start(), c = await ready(fourth, b.instance_id);
  assert((await projects(c)).some(p => p.id === project.id));
  await close(fourth);
  const logs = path.join(path.dirname(directory), 'logs');
  assert(fs.existsSync(path.join(logs, 'figtide.log')));
  for (const file of fs.readdirSync(logs)) assert(!fs.readFileSync(path.join(logs, file), 'utf8').includes(canary), 'API key must not appear in logs');
  const report = { checkedAt: new Date().toISOString(), passed: ['random port', 'same-JAR SPA', 'Chinese/spaced path',
    'single instance', 'normal exit removes port', 'normal restart persists', 'forced restart persists', 'rotating log location', 'no model key in logs'],
    dataDirectory: path.relative(root, directory), ports: [a.port, b.port, c.port] };
  fs.writeFileSync(path.join(root, '.runtime/desktop-launcher-probe.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const child of children) if (child.exitCode === null && !child.killed) child.kill();
});
