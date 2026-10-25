const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

test('real jpackage launcher preserves Unicode arguments and paths after manifest update', { skip: process.platform !== 'win32', timeout: 90000 }, () => {
  const local = path.resolve(__dirname, '../../.runtime/java');
  const jdk = process.env.JAVA_HOME || fs.readdirSync(local).map(name => path.join(local, name)).find(p => fs.existsSync(path.join(p, 'bin/jpackage.exe')));
  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'figtide-launcher-unicode-'));
  const input = path.join(owned, 'input'); fs.mkdirSync(input);
  const source = path.join(owned, 'UnicodeProbe.java');
  fs.writeFileSync(source, 'public class UnicodeProbe { public static void main(String[] args) throws Exception { var p = java.nio.file.Path.of(args[0]); java.nio.file.Files.createDirectories(p.getParent()); java.nio.file.Files.writeString(p, args[1]); } }');
  const run = (file, args) => execFileSync(file, args, { windowsHide: true, timeout: 30000, encoding: 'utf8' });
  run(path.join(jdk, 'bin/javac.exe'), ['-d', input, source]);
  run(path.join(jdk, 'bin/jar.exe'), ['--create', '--file', path.join(input, 'probe.jar'), '-C', input, 'UnicodeProbe.class']);
  const runtime = path.join(owned, 'runtime');
  run(path.join(jdk, 'bin/jlink.exe'), ['--add-modules', 'java.base', '--output', runtime]);
  run(path.join(jdk, 'bin/jpackage.exe'), ['--type', 'app-image', '--win-console', '--name', 'UnicodeProbe', '--input', input,
    '--main-jar', 'probe.jar', '--main-class', 'UnicodeProbe', '--runtime-image', runtime, '--dest', path.join(owned, 'image')]);
  const app = path.join(owned, 'image/UnicodeProbe');
  const exe = path.join(app, 'UnicodeProbe.exe');
  const before = fs.readFileSync(exe);
  const marker = '中文 空间 Δ café 🧪';
  const target = path.join(owned, marker, 'result.txt');
  // Reproduce the actual old launcher failure on non-UTF8 Windows locales. On
  // machines already using CP65001 the old launcher may work; the positive
  // preservation assertion below always runs, with no skipped assertions.
  let original;
  try { run(exe, [target, marker]); original = fs.existsSync(target) && fs.readFileSync(target, 'utf8') === marker; }
  catch { original = false; }
  console.log('Original Unicode launch preserved:', original);
  const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const xml = run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'set-launcher-utf8.ps1'), '-Executable', exe]);
  assert(xml.includes('>UTF-8</activeCodePage>'));
  assert(xml.includes('level="asInvoker"'));
  assert(xml.includes('dpiAware'));
  assert(before.includes(Buffer.from('level="asInvoker"')));
  assert(fs.readFileSync(exe).includes(Buffer.from('>UTF-8</activeCodePage>')));
  run(exe, [target, marker]);
  assert.equal(fs.readFileSync(target, 'utf8'), marker);
  // Install directory and data path must both survive non-ANSI characters.
  const relocated = path.join(owned, '中文 安装 Δ café', 'app');
  fs.cpSync(app, relocated, { recursive: true });
  const second = path.join(owned, marker, 'second.txt');
  run(path.join(relocated, 'UnicodeProbe.exe'), [second, marker]);
  assert.equal(fs.readFileSync(second, 'utf8'), marker);
});
