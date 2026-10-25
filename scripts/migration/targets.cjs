'use strict';

/** Names are bounded by the existing Java API's UTF-16 length limit. */
function candidateName(name, index) {
  if (index === 0) return name;
  const suffix = `（迁移${index > 1 ? index : ''}）`;
  let prefix = name.slice(0, 120 - suffix.length);
  // Never split an astral character into an unpaired surrogate.
  if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
  return prefix + suffix;
}

function candidateIndex(source, name) {
  if (name === source) return 0;
  const match = name.match(/（迁移(\d*)）$/);
  if (!match) return -1;
  const index = match[1] ? Number(match[1]) : 1;
  if (!Number.isSafeInteger(index) || index < 1 || candidateName(source, index) !== name) return -1;
  return index;
}

/** Include all same-name rows and suffixes beyond gaps left by deleted projects. */
function candidates(projects, source) {
  return projects.map(project => ({ project, index: candidateIndex(source, project.name) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index || a.project.id - b.project.id);
}

function freeName(projects, source) {
  const names = new Set(projects.map(project => project.name));
  for (let index = 0; ; index++) {
    const name = candidateName(source, index);
    if (!names.has(name)) return name;
  }
}

function serviceAddress(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('服务地址须为不含账号、查询参数或片段的 HTTP(S) 地址');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.href.replace(/\/+$/, '');
}

module.exports = { candidateName, candidateIndex, candidates, freeName, serviceAddress };
