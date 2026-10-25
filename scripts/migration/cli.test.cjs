const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { candidateName } = require('./targets.cjs');

function zip(manifest) {
  const text = JSON.stringify(manifest);
  const files = [['manifest.json', text], ['sha256.txt', crypto.createHash('sha256').update(text).digest('hex')]];
  const local = [], central = []; let offset = 0;
  for (const [name, value] of files) {
    const n = Buffer.from(name), raw = Buffer.from(value), data = zlib.deflateRawSync(raw);
    let crc = 0xffffffff;
    for (const byte of raw) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(raw.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    local.push(l, n, data); central.push(c, n); offset += l.length + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

function manifest(name) {
  return { format: 'labflow-project-v1', created_at: '2026-10-01T00:00:00Z',
    project: { id: 1, name, description: 'source', created_at: '2026-10-01T00:00:00Z', archived: false },
    tables: Object.fromEntries(['datasets', 'dataset_versions', 'experiments', 'experiment_datasets', 'charts', 'chart_versions', 'style_templates'].map(k => [k, []])) };
}

async function fixture(t, name, seed = []) {
  const source = manifest(name), projects = structuredClone(seed);
  let restored = 0; const oldRequests = [];
  const server = http.createServer(async (req, res) => {
    const send = (code, body, zipped = false) => { res.writeHead(code, { 'Content-Type': zipped ? 'application/zip' : 'application/json' }); res.end(zipped ? body : JSON.stringify(body)); };
    if (req.url.startsWith('/old')) {
      oldRequests.push(`${req.method} ${req.url.slice(4)}`);
      if (req.method !== 'GET') return send(405, {});
      if (req.url === '/old/api/projects') return send(200, [source.project]);
      if (req.url === '/old/api/projects/1/backup') return send(200, zip(source), true);
      return send(404, {});
    }
    if (req.url === '/new/api/desktop/ping') return send(200, { instance_id: 'local-cli-fixture' });
    if (req.url === '/new/api/projects') return send(200, projects.map(p => p.project));
    if (req.url === '/new/api/backups/preview') { for await (const _ of req) {} return send(200, {}); }
    if (req.url === '/new/api/backups/restore') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const form = await new Request('http://fixture', { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }).formData();
      const targetName = form.get('name');
      if (!targetName || targetName.length > 120) return send(400, { message: '新项目名称须为 1–120 字' });
      const m = structuredClone(source); m.project.id = 100 + ++restored; m.project.name = targetName;
      projects.push(m); return send(200, m.project);
    }
    const match = req.url.match(/^\/new\/api\/projects\/(\d+)\/backup$/);
    if (match) { const p = projects.find(p => p.project.id === Number(match[1])); return p ? send(200, zip(p), true) : send(404, {}); }
    return send(404, {});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'figtide-migration-test-'));
  t.after(() => {
    const resolved = path.resolve(directory), allowed = path.resolve(os.tmpdir()) + path.sep;
    assert(resolved.startsWith(allowed) && path.basename(resolved).startsWith('figtide-migration-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function run(...options) {
    const out = path.join(directory, crypto.randomUUID());
    const child = spawn(process.execPath, [path.join(__dirname, 'migrate.cjs'), '--from', base + '/old', '--to', base + '/new', '--out', out, ...options], { windowsHide: true });
    let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
    const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
    assert(fs.existsSync(path.join(out, 'migration-report.json')), output);
    const report = JSON.parse(fs.readFileSync(path.join(out, 'migration-report.json'), 'utf8'));
    return { code, row: report.projects[0] };
  }
  return { source, projects, run, restored: () => restored, oldRequests };
}

for (const name of ['P', '研'.repeat(120)]) {
  test(`collision migration, rerun and Verify share the actual target (${name.length} chars)`, async t => {
    const unrelated = manifest(name); unrelated.project.id = 10; unrelated.project.description = 'unrelated';
    const f = await fixture(t, name, [unrelated]);
    const first = await f.run(); assert.equal(first.code, 0); assert.equal(first.row.result, '成功');
    assert.equal(first.row.target_name, candidateName(name, 1)); assert(first.row.target_name.length <= 120);
    const again = await f.run(); assert.equal(again.code, 0); assert.equal(again.row.result, '已迁移');
    const verify = await f.run('--verify'); assert.equal(verify.code, 0); assert.equal(verify.row.target_id, first.row.target_id);
    const migrated = f.projects.find(p => p.project.id === first.row.target_id); migrated.project.description = 'tampered';
    const bad = await f.run('--verify'); assert.equal(bad.code, 1); assert.equal(bad.row.target_id, first.row.target_id); assert(bad.row.diffs.length > 0);
    assert.equal(f.restored(), 1);
    assert(f.oldRequests.every(r => r === 'GET /api/projects' || r === 'GET /api/projects/1/backup'));
  });
}

test('all same-name projects and suffixes beyond a gap can be reused', async t => {
  for (const suffix of [0, 2]) {
    const wrong = manifest('P'); wrong.project.id = 10; wrong.project.description = 'wrong';
    const right = manifest(candidateName('P', suffix)); right.project.id = 11;
    const f = await fixture(t, 'P', [wrong, right]);
    const result = await f.run('--verify'); assert.equal(result.code, 0); assert.equal(result.row.target_id, 11);
    const again = await f.run(); assert.equal(again.code, 0); assert.equal(again.row.target_id, 11);
    assert.equal(f.restored(), 0);
  }
});

test('DryRun creates no projects and only reads the permitted source routes', async t => {
  const f = await fixture(t, 'P'); const result = await f.run('--dry-run');
  assert.equal(result.code, 0); assert.equal(result.row.result, '干跑'); assert.equal(f.restored(), 0);
  assert.deepEqual(f.oldRequests, ['GET /api/projects', 'GET /api/projects/1/backup']);
});
