'use strict';
// 任务 14-3-3：读取备份 zip 里的 manifest.json。
// 备份 zip 由 BackupService.export() 生成，固定两个条目：manifest.json + sha256.txt，
// DEFLATED 或 STORED。这里实现一个只读的最小 zip 解析器（中心目录 → 本地头 → inflateRaw），
// 不引入第三方依赖。备份规模最大 512 MiB（desktop 上限），全部在内存中处理。

const zlib = require('node:zlib');

const EOCD_SIG = 0x06054b50;
const CD_ENTRY_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

function findEocd(buf) {
  // EOCD 至少 22 字节，后面的注释最多 65535 字节。
  const start = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      return {
        entryCount: buf.readUInt16LE(i + 10),
        cdSize: buf.readUInt32LE(i + 12),
        cdOffset: buf.readUInt32LE(i + 16),
      };
    }
  }
  throw new Error('备份 zip 中找不到结束目录（EOCD）');
}

function readEntries(buf) {
  const eocd = findEocd(buf);
  const entries = new Map();
  let pos = eocd.cdOffset;
  for (let i = 0; i < eocd.entryCount; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== CD_ENTRY_SIG) {
      throw new Error(`备份 zip 中心目录条目 #${i + 1} 损坏`);
    }
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLength = buf.readUInt16LE(pos + 28);
    const extraLength = buf.readUInt16LE(pos + 30);
    const commentLength = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLength);
    entries.set(name, { method, compressedSize, localOffset });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function inflateEntry(buf, entry) {
  if (buf.readUInt32LE(entry.localOffset) !== LFH_SIG) {
    throw new Error('备份 zip 本地文件头损坏');
  }
  const nameLength = buf.readUInt16LE(entry.localOffset + 26);
  const extraLength = buf.readUInt16LE(entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`备份 zip 使用了不支持的压缩方式 ${entry.method}`);
}

/** 读取备份 zip，返回 { manifestText, sha256Text }；条目缺失时报错。 */
function readBackupZip(zipBytes) {
  const entries = readEntries(zipBytes);
  const manifest = entries.get('manifest.json');
  const sha = entries.get('sha256.txt');
  if (!manifest || !sha) {
    throw new Error('备份 zip 缺少 manifest.json 或 sha256.txt');
  }
  return {
    manifestText: inflateEntry(zipBytes, manifest).toString('utf8'),
    sha256Text: inflateEntry(zipBytes, sha).toString('utf8').trim(),
  };
}

/** 解析 manifest 并做与 BackupService.read() 等价的 sha256 校验。 */
function parseManifest(zipBytes) {
  const { manifestText, sha256Text } = readBackupZip(zipBytes);
  const crypto = require('node:crypto');
  const actual = crypto.createHash('sha256').update(manifestText, 'utf8').digest('hex');
  if (actual !== sha256Text) {
    throw new Error(`备份清单校验失败：期望 ${sha256Text}，实际 ${actual}`);
  }
  return JSON.parse(manifestText);
}

module.exports = { readBackupZip, parseManifest };
