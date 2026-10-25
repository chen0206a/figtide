const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { diagnostics } = require('./probe-diagnostics.cjs');

test('diagnostic events persist UTC timestamps and monotonic elapsed time', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'figtide-diagnostic-'));
  const log = diagnostics(directory);
  log.event('process-start', { pid: 123 });
  log.event('readiness-timeout', { port_file_seen: false });
  const events = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 2);
  assert.equal(events[0].pid, 123);
  assert.match(events[0].at, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert(events[1].elapsed_ms >= events[0].elapsed_ms);
  assert.equal(events[1].port_file_seen, false);
});

test('comparison uses the bundled jar with explicit desktop, isolated data and no UI flags', () => {
  const { javaArgs } = require('./probe-startup-comparison.cjs');
  const args = javaArgs('C:/app/figtide.jar', 'C:/owned/中文 空间/data', 17921);
  assert(args.includes('-Dspring.profiles.active=desktop'));
  assert(args.includes('--labflow.data-dir=C:/owned/中文 空间/data'));
  assert(args.includes('--labflow.desktop.tray=false'));
  assert(args.includes('--labflow.desktop.open-browser=false'));
  assert.deepEqual(args.slice(2, 4), ['-jar', 'C:/app/figtide.jar']);
  assert.equal(args.slice(4)[0], '--labflow.data-dir=C:/owned/中文 空间/data');
});

test('Windows failure snapshot records process exit status, listener and excluded port commands', { skip: process.platform !== 'win32' }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'figtide-diagnostic-'));
  await diagnostics(directory).snapshot([{ pid: undefined, exitCode: 17, signalCode: null }], path.join(directory, 'missing-app'), 'simulated failure');
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'diagnostics.json'), 'utf8'));
  assert.equal(report.reason, 'simulated failure');
  assert.equal(report.processes[0].running, false);
  assert.equal(report.processes[0].exit_code, 17);
  assert.equal(report.java_arguments_verified, false);
  for (const file of ['processes.txt', 'listeners.txt', 'excluded-ports.txt']) assert(fs.existsSync(path.join(directory, file)), file);
  assert(fs.statSync(path.join(directory, 'excluded-ports.txt')).size > 0);
});
