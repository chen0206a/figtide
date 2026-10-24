'use strict';
// 任务 14-3-3：zip.cjs（备份 zip 最小解析器）单元测试。
// 在测试内用 zlib 自建 zip（STORED 与 DEFLATED 两种），不依赖外部 fixture。
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { readBackupZip, parseManifest } = require('./zip.cjs');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 自建一个两条目（manifest.json + sha256.txt）的 zip，method 8 = DEFLATED，0 = STORED。 */
function buildZip(manifestText, { method = 8 } = {}) {
  const sha = crypto.createHash('sha256').update(manifestText, 'utf8').digest('hex');
  const files = [
    { name: 'manifest.json', data: Buffer.from(manifestText, 'utf8') },
    { name: 'sha256.txt', data: Buffer.from(sha, 'utf8') },
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = method === 8 ? zlib.deflateRawSync(f.data) : f.data;
    const crc = crc32(f.data);
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10); // time
    lfh.writeUInt16LE(0x21, 12); // date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18);
    lfh.writeUInt32LE(f.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    locals.push(lfh, nameBuf, data);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x21, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(data.length, 20);
    cdh.writeUInt32LE(f.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);
    centrals.push(cdh, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(offset, 12);
  eocd.writeUInt32LE(0, 16); // cdOffset 由下面补
  const cdOffset = locals.reduce((n, b) => n + b.length, 0);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

const manifestText = JSON.stringify({
  format: 'labflow-project-v1',
  created_at: '2026-10-02T00:00:00Z',
  project: { id: 1, name: 'P', created_at: '2026-09-01T00:00:00Z' },
  tables: {
    datasets: [], dataset_versions: [], experiments: [], experiment_datasets: [],
    charts: [], chart_versions: [], style_templates: [],
  },
});

test('DEFLATED 备份 zip 可解析并校验 sha256', () => {
  const zip = buildZip(manifestText, { method: 8 });
  const manifest = parseManifest(zip);
  assert.equal(manifest.format, 'labflow-project-v1');
});

test('STORED 备份 zip 可解析', () => {
  const zip = buildZip(manifestText, { method: 0 });
  assert.equal(parseManifest(zip).project.name, 'P');
});

test('manifest 内容被篡改（sha 不匹配）→ 校验失败', () => {
  const zip = buildZip(manifestText);
  const { manifestText: text, sha256Text: sha } = readBackupZip(zip);
  assert.equal(sha.length, 64);
  const tampered = buildZipCustom([
    { name: 'manifest.json', data: Buffer.from(text.replace('"P"', '"X"'), 'utf8') },
    { name: 'sha256.txt', data: Buffer.from(sha, 'utf8') }, // 仍是旧哈希
  ]);
  assert.throws(() => parseManifest(tampered), /校验失败/);
});

test('缺少 sha256.txt 条目 → 报错', () => {
  const zip = buildZipCustom([
    { name: 'manifest.json', data: Buffer.from(manifestText, 'utf8') },
  ]);
  assert.throws(() => readBackupZip(zip), /缺少 manifest.json 或 sha256.txt/);
});

test('非 zip 字节 → 找不到 EOCD', () => {
  assert.throws(() => readBackupZip(Buffer.alloc(64, 1)), /EOCD/);
});

function buildZipCustom(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = zlib.deflateRawSync(f.data);
    const crc = crc32(f.data);
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(8, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0x21, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18);
    lfh.writeUInt32LE(f.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    locals.push(lfh, nameBuf, data);
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x21, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(data.length, 20);
    cdh.writeUInt32LE(f.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);
    centrals.push(cdh, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(offset, 12);
  const cdOffset = locals.reduce((n, b) => n + b.length, 0);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}
