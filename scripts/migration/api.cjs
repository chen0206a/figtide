'use strict';
// 任务 14-3-2：迁移工具的 HTTP 客户端。只用 Node 24 的原生 fetch。
// 旧版侧只允许 GET；桌面版侧的写操作只有备份恢复、项目更新（归档）和导出（GET）。

const fs = require('node:fs');

const JSON_HEADERS = { 'content-type': 'application/json' };

class ApiError extends Error {
  constructor(status, message, body) {
    super(`${status} ${message}`);
    this.status = status;
    this.body = body;
  }
}

function trimSlash(url) {
  return url.replace(/\/+$/, '');
}

async function readBody(res) {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson(url, path, init = {}) {
  const res = await fetch(trimSlash(url) + path, init);
  const body = await readBody(res);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && body.message ? body.message : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, body);
  }
  return body;
}

async function getJson(url, path) {
  return requestJson(url, path);
}

async function putJson(url, path, payload) {
  return requestJson(url, path, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

async function postJson(url, path, payload) {
  return requestJson(url, path, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

async function download(url, path, toFile) {
  const res = await fetch(trimSlash(url) + path);
  if (!res.ok) {
    const body = await readBody(res);
    const message =
      body && typeof body === 'object' && body.message ? body.message : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, body);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (toFile) fs.writeFileSync(toFile, bytes);
  return bytes;
}

async function postZip(url, path, zipBytes, fields = {}) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([zipBytes], { type: 'application/zip' }),
    'backup.labflow.zip'
  );
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const res = await fetch(trimSlash(url) + path, { method: 'POST', body: form });
  const body = await readBody(res);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && body.message ? body.message : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, body);
  }
  return body;
}

module.exports = { ApiError, getJson, putJson, postJson, download, postZip, trimSlash };
