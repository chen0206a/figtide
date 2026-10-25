#!/usr/bin/env node
// 任务 16-4：Windows 进程探针——真实启动桌面后端 + Edge 应用模式窗口。
//
// 生产路径（DesktopWindow.command()）绝不包含 --remote-debugging-port；
// 只有本探针为了验证窗口内容才加上 --remote-debugging-port=0，并读取
// user-data-dir 下的 DevToolsActivePort 文件连接 DevTools HTTP 接口。
//
// 用法：
//   node scripts/desktop/edge-window-probe.cjs --app <打包后的 FigTide 目录>
//   node scripts/desktop/edge-window-probe.cjs --jar <figtide.jar> --java-home <JDK 目录>
// 可选：--out <报告 JSON 路径>（默认 .runtime/edge-window-probe.json）、--keep（保留临时目录）
const { spawn, execSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const keep = process.argv.includes('--keep');

// ---- 解析 java 与 jar ----
function resolveApp() {
  const app = arg('app');
  if (app) {
    const jar = path.join(app, 'app', 'figtide.jar');
    const java = path.join(app, 'runtime', 'bin', 'java.exe');
    if (!fs.existsSync(jar)) throw new Error(`找不到 ${jar}（--app 应指向打包后的 FigTide 目录）`);
    if (!fs.existsSync(java)) throw new Error(`找不到 ${java}（打包目录应内嵌运行时）`);
    return { jar, java, kind: 'packaged' };
  }
  const jar = arg('jar');
  const javaHome = arg('java-home');
  if (!jar || !javaHome) throw new Error('需要 --app <FigTide 目录> 或 --jar <jar> + --java-home <JDK 目录>');
  const java = path.join(javaHome, 'bin', 'java.exe');
  if (!fs.existsSync(jar)) throw new Error(`找不到 ${jar}`);
  if (!fs.existsSync(java)) throw new Error(`找不到 ${java}`);
  return { jar, java, kind: 'dev' };
}

// ---- 找 Edge（与 DesktopWindow.findEdge 同规则：注册表 App Paths 优先，程序目录兜底）----
function findEdge() {
  const roots = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
  ];
  for (const key of roots) {
    try {
      const out = execSync(`reg query "${key}" /ve`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const line = out.split(/\r?\n/).find((l) => l.includes('REG_SZ'));
      if (!line) continue;
      let value = line.slice(line.indexOf('REG_SZ') + 6).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value && fs.existsSync(value)) return value;
    } catch { /* 该根不存在或被拒绝，继续 */ }
  }
  const candidates = [
    process.env['ProgramFiles(x86)'], process.env.ProgramFiles,
  ].filter(Boolean).map((p) => path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

// ---- 端口 ----
function freePort(from, to) {
  return new Promise((resolve, reject) => {
    const probe = (p) => {
      const srv = net.createServer();
      srv.once('error', () => { if (p >= to) reject(new Error('没有可用端口')); else probe(p + 1); });
      srv.once('listening', () => srv.close(() => resolve(p)));
      srv.listen(p, '127.0.0.1');
    };
    probe(from);
  });
}

async function waitFor(fn, { attempts = 180, interval = 250, label = '' } = {}) {
  for (let i = 0; i < attempts; i++) {
    const value = await fn();
    if (value !== undefined && value !== null && value !== false) return value;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`等待超时：${label}`);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// 找出命令行里带本探针临时目录的 msedge 进程（兜底清理，防止 taskkill /T 漏网）
function sweepEdgePids() {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*edge-window-*' } | ForEach-Object { $_.ProcessId }",
    ], { encoding: 'utf8' });
    return out.split(/\s+/).filter(Boolean);
  } catch { return []; }
}

async function main() {
  const { jar, java, kind } = resolveApp();
  const edge = findEdge();
  if (!edge) throw new Error('本机未找到 Microsoft Edge（reg query App Paths 与程序目录均未命中）');

  const owned = path.join(root, '.runtime', `edge-window-${process.pid}`);
  const dataDir = path.join(owned, 'data');
  const userDataDir = path.join(owned, 'window'); // 与 DesktopWindow.userDataDir 同布局（data 的兄弟目录）
  fs.mkdirSync(dataDir, { recursive: true });

  const port = await freePort(17940, 18020);
  const report = {
    probe: 'edge-window', app_kind: kind, jar, java, edge, data_dir: dataDir,
    user_data_dir: userDataDir, backend_port: port, passed: [],
  };

  // 1. 启动桌面后端（不自动开窗口；窗口由探针带调试端口启动）
  const backend = spawn(java, [
    '-jar', jar,
    '--spring.profiles.active=desktop',
    `--labflow.data-dir=${dataDir}`,
    `--labflow.desktop.port=${port}`,
    '--labflow.desktop.open-browser=false',
    '--labflow.desktop.tray=false',
  ], { cwd: owned, stdio: ['ignore', 'pipe', 'pipe'] });
  const backendLog = [];
  backend.stdout.on('data', (d) => backendLog.push(String(d)));
  backend.stderr.on('data', (d) => backendLog.push(String(d)));

  let edgeProc = null;
  try {
    // 2. 等后端就绪：app.port + /api/desktop/ping + /api/health
    const instance = await waitFor(async () => {
      try {
        const ping = await getJson(`http://127.0.0.1:${port}/api/desktop/ping`);
        if (!ping.instance_id) return null;
        const health = await getJson(`http://127.0.0.1:${port}/api/health`);
        return health.status === 'ok' ? ping : null;
      } catch { return null; }
    }, { label: '后端就绪' });
    const portFile = JSON.parse(fs.readFileSync(path.join(dataDir, 'app.port'), 'utf8'));
    if (portFile.port !== port || portFile.instance_id !== instance.instance_id) {
      throw new Error('app.port 与实际实例不一致');
    }
    report.passed.push('backend ready (app.port + ping + health)');

    // 3. 以生产参数 + 调试端口启动 Edge 应用窗口
    //    除最后的调试端口外，参数必须与 DesktopWindow.command() 保持一致。
    const uri = `http://127.0.0.1:${port}/`;
    const edgeArgs = [
      `--app=${uri}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      '--remote-debugging-port=0', // 仅探针；生产绝不加
    ];
    edgeProc = spawn(edge, edgeArgs, { stdio: 'ignore' });
    report.edge_pid = edgeProc.pid;
    report.edge_args = edgeArgs;

    // 4. 等 DevToolsActivePort 出现（Edge 写入 user-data-dir）
    const devtools = await waitFor(() => {
      try {
        const text = fs.readFileSync(path.join(userDataDir, 'DevToolsActivePort'), 'utf8').trim();
        const devtoolsPort = Number(text.split(/\r?\n/)[0]);
        return Number.isInteger(devtoolsPort) && devtoolsPort > 0 ? devtoolsPort : null;
      } catch { return null; }
    }, { attempts: 120, interval: 250, label: 'DevToolsActivePort' });
    report.devtools_port = devtools;
    report.passed.push('DevToolsActivePort written');

    // 5. /json/list 找到应用窗口页面：同源（http://127.0.0.1:<port>/ 开头，SPA 会把 / 重定向到 /welcome
    //    等具体路由），标题含 FigTide。见 16-4 任务书「页面 URL + 标题」断言。
    const page = await waitFor(async () => {
      try {
        const list = await getJson(`http://127.0.0.1:${devtools}/json/list`);
        const hit = list.find((t) => t.type === 'page' && (t.url === uri || t.url.startsWith(uri)));
        if (!hit) return null;
        return hit.title && hit.title.includes('FigTide') ? hit : null;
      } catch { return null; }
    }, { attempts: 120, interval: 250, label: '应用窗口页面' });
    report.page_url = page.url;
    report.page_title = page.title;
    report.passed.push(`app window page: url=${page.url} title=${page.title}`);

    // 6. 首页静态资源可达（窗口里真正渲染了工作台）
    const index = await fetch(`${uri}index.html`);
    if (!index.ok) throw new Error(`index.html -> HTTP ${index.status}`);
    report.passed.push('index.html served');

    report.ok = true;
  } finally {
    // 7. 清理：先杀 Edge（树 + 兜底扫描）与后端，再删临时目录
    if (edgeProc && edgeProc.exitCode === null) {
      try { execSync(`taskkill /PID ${edgeProc.pid} /T /F`, { stdio: 'ignore' }); } catch { /* 已退出 */ }
    }
    for (const pid of sweepEdgePids()) {
      try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* 已退出 */ }
    }
    if (backend.exitCode === null) backend.kill('SIGKILL');
    for (let i = 0; i < 5 && !keep; i++) {
      try { fs.rmSync(owned, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 400)); }
    }
    if (!keep) {
      report.temp_dir_removed = !fs.existsSync(owned);
      if (!report.temp_dir_removed) report.temp_dir_warning = `未能删除 ${owned}（Edge 句柄未释放）`;
    }
    if (backendLog.length) {
      const logPath = path.join(root, '.runtime', 'edge-window-probe-backend.log');
      fs.writeFileSync(logPath, backendLog.join(''));
      report.backend_log = logPath;
    }
    const out = arg('out') || path.join(root, '.runtime', 'edge-window-probe.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`EDGE_WINDOW_PROBE_OK (${report.passed.join('; ')})`);
    console.log(`report: ${out}`);
  }
}

main().catch((e) => {
  console.error(`EDGE_WINDOW_PROBE_FAIL: ${e.message}`);
  process.exitCode = 1;
});
