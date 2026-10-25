const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { diagnostics } = require('./probe-diagnostics.cjs');
const arg = name => process.argv[process.argv.indexOf('--' + name) + 1];
const root = path.resolve(__dirname, '../..'), app = path.resolve(arg('app'));
const metadata = JSON.parse(fs.readFileSync(path.join(app, 'build-info.json'), 'utf8'));
const owned = path.join(root, '.runtime', 'package-smoke-' + crypto.randomUUID());
const data = path.join(owned, '\u4e2d\u6587 \u7a7a\u95f4', 'data'), cwd = path.join(owned, 'unrelated-working-directory');
fs.mkdirSync(cwd, { recursive: true });
const diagnostic = diagnostics(owned);
const children = [], checks = [];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['path','java_home','jdk_home','java_tool_options','jdk_java_options','_java_options','labflow_agent_api_key','labflow_agent_base_url'].includes(k.toLowerCase())));
env.Path = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
env.JAVA_HOME = path.join(owned, 'no-system-jdk'); env.LABFLOW_AGENT_API_KEY = ''; env.LABFLOW_AGENT_BASE_URL = 'http://127.0.0.1:1';
// Native jpackage diagnostics include the actual arguments passed to the JVM.
env.JPACKAGE_DEBUG = 'true';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  for (let port = 17920; port < 18020; port++) {
    const server = net.createServer();
    try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
    catch { continue; }
    await new Promise(resolve => server.close(resolve)); return port;
  }
  throw Error('No isolated probe port available');
}
function start(port) {
  const fd = fs.openSync(path.join(owned, `process-${children.length}.log`), 'w');
  const args = [`--labflow.data-dir=${data}`, '--labflow.desktop.open-browser=false', '--labflow.desktop.tray=false',
    ...(port ? [`--labflow.desktop.port=${port}`] : [])];
  const child = spawn(path.join(app, 'FigTide.exe'), args, { cwd, env, windowsHide: true, stdio: ['ignore', fd, fd] });
  diagnostic.event('process-start', { pid: child.pid, args });
  child.on('error', error => diagnostic.event('process-error', { message: error.message }));
  child.on('exit', (code, signal) => diagnostic.event('process-exit', { pid: child.pid, exit_code: code, signal }));
  fs.closeSync(fd); children.push(child); return child;
}
async function exited(child, normal = false) {
  if (child.exitCode === null && child.signalCode === null) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Owned EXE did not exit')), 15000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (normal) assert.equal(child.exitCode, 0);
}
async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited(child); }
}
async function ready(child, previous = '') {
  let portSeen = false, lastError;
  for (let i = 0; i < 180; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw Error('Packaged EXE exited; inspect ' + owned);
    try {
      const record = JSON.parse(fs.readFileSync(path.join(data, 'app.port'), 'utf8'));
      if (record.instance_id !== previous) {
        if (!portSeen) { diagnostic.event('port-file-appeared', { pid: child.pid, record }); portSeen = true; }
        const response = await fetch(`http://127.0.0.1:${record.port}/api/desktop/ping`, { signal: AbortSignal.timeout(1000) });
        if (response.ok && (await response.json()).instance_id === record.instance_id) {
          diagnostic.event('ping-first-success', { pid: child.pid, port: record.port }); return record;
        }
        lastError = 'Ping HTTP ' + response.status;
      }
    } catch (error) { lastError = error.message; }
    await delay(250);
  }
  diagnostic.event('readiness-timeout', { pid: child.pid, last_error: lastError, port_file_seen: portSeen });
  throw Error('Packaged EXE was not ready; inspect ' + owned);
}
async function json(base, url, init) {
  const response = await fetch(base + '/api' + url, init); const text = await response.text();
  assert(response.ok, `${response.status}: ${text}`); return JSON.parse(text);
}
const post = data => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

(async () => {
  const icon = fs.readFileSync(arg('icon')), executable = fs.readFileSync(path.join(app, 'FigTide.exe'));
  assert.equal(icon.readUInt16LE(4), 4);
  for (let i = 0; i < 4; i++) {
    const entry = 6 + 16 * i, size = icon.readUInt32LE(entry + 8), offset = icon.readUInt32LE(entry + 12);
    assert(executable.includes(icon.subarray(offset, offset + size)), 'EXE must embed the existing brand icon at every size');
  }
  checks.push('release ZIP/checksums, EXE version and four embedded brand icon sizes');
  const cfg = fs.readFileSync(path.join(app, 'app/FigTide.cfg'), 'utf8');
  assert(cfg.includes('-Duser.timezone=UTC')); assert(cfg.includes('-Dspring.profiles.active=desktop'));
  checks.push('launcher fixes UTC and desktop profile even with user arguments');
  for (const module of ['java.desktop','java.sql','java.net.http','jdk.crypto.ec','jdk.charsets','jdk.unsupported','jdk.zipfs'])
    assert(metadata.runtime_modules.includes(module), module);
  assert(fs.existsSync(path.join(app, 'runtime/legal')));
  assert(fs.readFileSync(path.join(app, 'LICENSE'), 'utf8').includes('MIT License'));
  const notices = fs.readFileSync(path.join(app, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
  assert(notices.includes('@fontsource-variable/inter')); assert(notices.includes('OPEN FONT LICENSE'));
  const files = fs.readdirSync(app, { recursive: true }).map(String);
  assert(!files.some(f => /(?:^|[\\/])(?:\.runtime|\.env|desktop\.json|app\.port|agent\.env)|\.(?:mv\.db|trace\.db)$/.test(f)));
  checks.push('runtime modules, project and dependency notices, no workspace files');
  const preferred = await freePort();
  const first = start(preferred), a = await ready(first);
  await diagnostic.snapshot([first], app, 'first-ping-success: verify Java received tray=false and open-browser=false');
  assert.equal(a.port, preferred);
  const base = `http://127.0.0.1:${a.port}`;
  const page = await fetch(base + '/projects/999/figures/new'); assert(page.ok); assert((await page.text()).includes('FigTide'));
  checks.push('starts without system Java from an unrelated directory and serves same-process SPA');
  const project = await json(base, '/projects', post({ name: 'Packaged synthetic test', description: 'Synthetic data, owned temporary H2' }));
  const form = new FormData(); form.append('file', new Blob(['epoch,accuracy,error\n1,0.700,0.010\n2,0.900,0.020\n']), 'synthetic.csv');
  const dataset = await json(base, `/projects/${project.id}/datasets`, { method: 'POST', body: form });
  const config = JSON.parse(fs.readFileSync(path.join(root, 'backend/src/test/resources/config-v1.json'), 'utf8')); config.datasetVersionId = dataset.id;
  const figure = await json(base, `/projects/${project.id}/charts`, post({ name: 'Packaged figure', config }));
  checks.push('real CSV upload and chart save use embedded H2');
  const second = start(); await exited(second, true);
  assert.equal(first.exitCode, null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'app.port'), 'utf8')).instance_id, a.instance_id);
  checks.push('second EXE exits without creating another server');
  const preferences = fs.readFileSync(path.join(data, 'desktop.json'), 'utf8');
  await stop(first);
  const third = start(), b = await ready(third, a.instance_id);
  assert.equal(b.port, preferred); assert.equal(fs.readFileSync(path.join(data, 'desktop.json'), 'utf8'), preferences);
  const reopened = await json(base, `/projects/${project.id}/charts/${figure.id}`);
  assert.deepEqual(reopened.config, config); assert.equal(reopened.revision, figure.revision);
  checks.push('forced restart keeps preferred origin and saved figure configuration');
  await stop(third);
  const report = { at: new Date().toISOString(), version: metadata.version, source_revision: metadata.source_revision,
    system_java_available_to_child: false, browser_or_tray_invoked: false, paid_model_calls: 0, passed: checks,
    ports: [a.port, b.port], evidence: path.relative(root, owned) };
  fs.writeFileSync(arg('out'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
})().catch(async e => {
  diagnostic.event('probe-failed', { error: String(e), stack: e.stack });
  try { await diagnostic.snapshot(children, app, 'probe-failed'); } catch (error) { console.error('Diagnostic collection failed:', error); }
  console.error(e); process.exitCode = 1;
}).finally(async () => {
  for (const child of children) await stop(child);
  fs.writeFileSync(path.join(owned, 'final-process-state.json'), JSON.stringify(children.map(c => ({ pid: c.pid, exit_code: c.exitCode, signal: c.signalCode })), null, 2));
});
