const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveApp, launchArgs } = require('./edge-window-probe.cjs');

test('relative package paths resolve before changing the backend working directory', () => {
  const root = path.resolve(__dirname, '../..');
  const runtime = path.join(root, '.runtime');
  fs.mkdirSync(runtime, { recursive: true });
  const directory = fs.mkdtempSync(path.join(runtime, 'window-probe-test-'));
  try {
    const app = path.join(directory, 'app');
    const classes = path.join(directory, 'classes');
    for (const file of [path.join(app, 'app/figtide.jar'), path.join(app, 'runtime/bin/java.exe'),
      path.join(classes, 'dev/labflow/desktop/DesktopWindowProbeMain.class')]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'fixture');
    }
    const application = resolveApp(['node', 'probe', '--app', path.relative(process.cwd(), app), '--probe-classes', classes]);
    assert.equal(application.jar, path.join(app, 'app/figtide.jar'));
    assert.equal(application.java, path.join(app, 'runtime/bin/java.exe'));
    const args = launchArgs(application, path.join(directory, 'data'), 17861);
    assert.ok(args.includes('--labflow.desktop.open-browser=true'));
    assert.ok(args.includes('-Dloader.main=dev.labflow.desktop.DesktopWindowProbeMain'));
    assert.ok(args.includes('org.springframework.boot.loader.launch.PropertiesLauncher'));
    assert.ok(!args.some((value) => value.includes('remote-debugging')));
  } finally {
    assert.ok(path.resolve(directory).startsWith(runtime + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
