// Failure-only diagnostic comparisons. Neither launcher can turn a failed production EXE probe green.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function javaArgs(jar, data, port) {
  return ['-Dspring.profiles.active=desktop', '-Duser.timezone=UTC', '-jar', jar,
    `--labflow.data-dir=${data}`, '--labflow.desktop.tray=false', '--labflow.desktop.open-browser=false', `--labflow.desktop.port=${port}`];
}

async function compare(app, owned, env, diagnostic, freePort) {
  const localJava = path.resolve(__dirname, '../../.runtime/java');
  const jdk = process.env.JAVA_HOME || (fs.existsSync(localJava) && fs.readdirSync(localJava, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(localJava, e.name))[0]);
  if (!jdk) throw Error('No build JDK for native console diagnostic');
  const target = path.resolve(owned, '..', 'launcher-diagnostic-' + path.basename(owned));
  fs.mkdirSync(target, { recursive: true });
  const args = ['--type', 'app-image', '--win-console', '--name', 'FigTideDiagnostic', '--app-version', '0.2.0',
    '--runtime-image', path.join(app, 'runtime'), '--input', path.join(app, 'app'), '--main-jar', 'figtide.jar',
    '--main-class', 'org.springframework.boot.loader.launch.JarLauncher', '--dest', target,
    '--java-options', '-Dspring.profiles.active=desktop', '--java-options', '-Duser.timezone=UTC'];
  diagnostic.event('console-diagnostic-build-start');
  const built = await execute(path.join(jdk, 'bin/jpackage.exe'), args, { windowsHide: true, timeout: 60000 });
  fs.writeFileSync(path.join(owned, 'console-build.log'), built.stdout + built.stderr);
  const cases = [
    { name: 'console-launcher', exe: path.join(target, 'FigTideDiagnostic/FigTideDiagnostic.exe') },
    { name: 'bundled-java', exe: path.join(app, 'runtime/bin/java.exe') },
  ];
  for (const c of cases) {
    const data = path.join(owned, c.name, '\u4e2d\u6587 \u7a7a\u95f4', 'data');
    const port = await freePort();
    const args = javaArgs(path.join(app, 'app/figtide.jar'), data, port);
    const actual = c.name === 'bundled-java' ? args : args.slice(4);
    const fd = fs.openSync(path.join(owned, c.name + '.log'), 'w');
    const child = spawn(c.exe, actual, { cwd: path.join(owned, 'unrelated-working-directory'), env, windowsHide: true, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    const started = performance.now();
    diagnostic.event('comparison-start', { name: c.name, pid: child.pid, args: actual });
    child.on('error', error => diagnostic.event('comparison-spawn-error', { name: c.name, error: String(error) }));
    try {
      for (let i = 0; i < 60 && child.exitCode === null && child.signalCode === null; i++) {
        if (fs.existsSync(path.join(data, 'app.port'))) break;
        await delay(250);
      }
      diagnostic.event('comparison-result', { name: c.name, startup_ms: Math.round(performance.now() - started),
        port_file_exists: fs.existsSync(path.join(data, 'app.port')), exit_code: child.exitCode, signal: child.signalCode });
    } finally {
      if (child.pid && child.exitCode === null && child.signalCode === null)
        await execute(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
    }
  }
}
module.exports = { compare, javaArgs };
