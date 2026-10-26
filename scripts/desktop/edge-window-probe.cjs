#!/usr/bin/env node
// Test-only loader calls DesktopLauncher.launch -> DesktopWindow.open, with a
// process boundary that appends CDP only after validating the production command.
// Run Maven test-compile first; the probe helper is outside the released JAR.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const marker = 'FIGTIDE_WINDOW_PROBE_START ';
function arg(name, argv = process.argv) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function resolveApp(argv = process.argv) {
  const app = arg('app', argv);
  const jar = app ? path.resolve(app, 'app', 'figtide.jar') : path.resolve(arg('jar', argv) || '');
  const java = app ? path.resolve(app, 'runtime', 'bin', 'java.exe')
    : path.resolve(arg('java-home', argv) || '', 'bin', 'java.exe');
  if (!app && (!arg('jar', argv) || !arg('java-home', argv)))
    throw new Error('需要 --app <FigTide 目录> 或 --jar <jar> + --java-home <JDK 目录>');
  const probeClasses = path.resolve(arg('probe-classes', argv) || path.join(root, 'backend', 'target', 'test-classes'));
  for (const file of [jar, java, path.join(probeClasses, 'dev', 'labflow', 'desktop', 'DesktopWindowProbeMain.class')])
    if (!fs.existsSync(file)) throw new Error(`找不到 ${file}；请先构建应用并执行 Maven test-compile`);
  return { jar, java, probeClasses, kind: app ? 'packaged' : 'dev' };
}

function launchArgs(application, dataDir, port) {
  return [
    '-Duser.timezone=UTC',
    '-Dloader.main=dev.labflow.desktop.DesktopWindowProbeMain',
    `-Dloader.path=${pathToFileURL(application.probeClasses + path.sep).href}`,
    '-cp', application.jar, 'org.springframework.boot.loader.launch.PropertiesLauncher',
    '--spring.profiles.active=desktop', `--labflow.data-dir=${dataDir}`,
    `--labflow.desktop.port=${port}`, '--labflow.desktop.window=app',
    '--labflow.desktop.open-browser=true', '--labflow.desktop.tray=false',
  ];
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitFor(fn, label) {
  for (let i = 0; i < 180; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待超时：${label}`);
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function sweepEdgePids(owned) {
  try {
    // Match only this run's unique directory, never another probe or user profile.
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_Process -Filter "Name=\'msedge.exe\'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:FIGTIDE_PROBE_OWNED) } | ForEach-Object { $_.ProcessId }',
    ], { encoding: 'utf8', windowsHide: true, env: { ...process.env, FIGTIDE_PROBE_OWNED: owned } });
    return output.split(/\s+/).filter((value) => /^\d+$/.test(value));
  } catch { return []; }
}

async function main() {
  const application = resolveApp();
  const runtimeRoot = path.join(root, '.runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const owned = fs.mkdtempSync(path.join(runtimeRoot, 'edge-window-'));
  const dataDir = path.join(owned, 'data');
  const userDataDir = path.join(owned, 'window');
  fs.mkdirSync(dataDir);
  // Do not add all test-classes to the application loader: its desktop-static
  // fixtures would shadow the actual bundled UI. Copy only the probe helper.
  const helperRelative = path.join('dev', 'labflow', 'desktop', 'DesktopWindowProbeMain.class');
  const isolatedClasses = path.join(owned, 'probe-classes');
  fs.mkdirSync(path.dirname(path.join(isolatedClasses, helperRelative)), { recursive: true });
  fs.copyFileSync(path.join(application.probeClasses, helperRelative), path.join(isolatedClasses, helperRelative));
  const port = await freePort();
  const report = { probe: 'edge-window', app_kind: application.kind, jar: application.jar,
    data_dir: dataDir, user_data_dir: userDataDir, backend_port: port, passed: [], ok: false };
  const backend = spawn(application.java, launchArgs({ ...application, probeClasses: isolatedClasses }, dataDir, port),
    { cwd: owned, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let spawnError;
  backend.stdout.on('data', (chunk) => { output += chunk.toString(); });
  backend.stderr.on('data', (chunk) => { output += chunk.toString(); });
  backend.on('error', (error) => { spawnError = error; });
  function checkBackend() {
    if (spawnError) throw spawnError;
    if (backend.exitCode !== null) throw new Error(`桌面启动器退出 ${backend.exitCode}: ${output.slice(-3000)}`);
  }
  try {
    const uri = `http://127.0.0.1:${port}/`;
    const instance = await waitFor(async () => {
      checkBackend();
      try {
        const ping = await getJson(`${uri}api/desktop/ping`);
        const health = await getJson(`${uri}api/health`);
        return ping.instance_id && health.status === 'ok' && ping;
      } catch { return null; }
    }, '后端就绪');
    const record = JSON.parse(fs.readFileSync(path.join(dataDir, 'app.port'), 'utf8'));
    if (record.port !== port || record.instance_id !== instance.instance_id) throw new Error('端口实例身份不一致');
    report.passed.push('backend ready (app.port + ping + health)');

    const launched = await waitFor(() => {
      checkBackend();
      const line = output.split(/\r?\n/).find((value) => value.startsWith(marker));
      if (!line) return null;
      try { return JSON.parse(line.slice(marker.length)); } catch { return null; }
    }, '产品窗口启动链路');
    Object.assign(report, launched);
    report.passed.push('DesktopLauncher.launch -> DesktopWindow.open -> Edge');

    const debugPort = await waitFor(() => {
      checkBackend();
      try {
        const value = Number(fs.readFileSync(path.join(userDataDir, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/)[0]);
        return Number.isInteger(value) && value > 0 && value;
      } catch { return null; }
    }, 'DevToolsActivePort');
    report.devtools_port = debugPort;
    const page = await waitFor(async () => {
      checkBackend();
      try {
        const pages = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
        report.observed_pages = pages.map(({ type, url, title }) => ({ type, url, title }));
        return pages.find((entry) => entry.type === 'page' && entry.url.startsWith(uri) && entry.title.includes('FigTide'));
      } catch { return null; }
    }, '应用窗口页面');
    report.page_url = page.url;
    report.page_title = page.title;
    report.passed.push('app window URL and FigTide title');
    report.ok = true;
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    for (const pid of sweepEdgePids(owned)) {
      try { execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { }
    }
    if (backend.exitCode === null && backend.pid) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        backend.once('exit', () => { clearTimeout(timer); resolve(); });
        backend.kill();
      });
    }
    if (!process.argv.includes('--keep')) {
      // owned came from mkdtemp within runtimeRoot; check again before recursion.
      if (!path.resolve(owned).startsWith(path.resolve(runtimeRoot) + path.sep)) throw new Error('Unsafe cleanup path');
      for (let i = 0; i < 5; i++) {
        try { fs.rmSync(owned, { recursive: true, force: true }); break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 400)); }
      }
      report.temp_dir_removed = !fs.existsSync(owned);
      if (!report.temp_dir_removed) { report.ok = false; report.error = '临时窗口目录未能清理'; }
    }
    fs.writeFileSync(path.join(runtimeRoot, 'edge-window-probe-backend.log'), output);
    const reportFile = path.resolve(arg('out') || path.join(runtimeRoot, 'edge-window-probe.json'));
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`${report.ok ? 'EDGE_WINDOW_PROBE_OK' : 'EDGE_WINDOW_PROBE_FAIL'}: ${reportFile}`);
    if (!report.ok) process.exitCode = 1;
  }
}

module.exports = { resolveApp, launchArgs };
if (require.main === module) main().catch((error) => {
  console.error(`EDGE_WINDOW_PROBE_FAIL: ${error.message}`);
  process.exitCode = 1;
});
