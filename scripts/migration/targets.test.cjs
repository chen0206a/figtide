const test = require('node:test');
const assert = require('node:assert/strict');
const { candidateName, candidateIndex, candidates, freeName, serviceAddress } = require('./targets.cjs');

test('120-character names reserve space for suffixes and remain stable', () => {
  const name = '研'.repeat(120);
  for (const i of [1, 2, 10, 12345]) {
    const candidate = candidateName(name, i);
    assert.equal(candidate.length, 120);
    assert.equal(candidateIndex(name, candidate), i);
  }
  assert.equal(freeName([{ name }], name), candidateName(name, 1));
});

test('truncation never leaves an unpaired surrogate', () => {
  const name = 'x'.repeat(115) + '🌊🌊';
  const candidate = candidateName(name, 1);
  assert(candidate.length <= 120);
  assert(!/[\uD800-\uDBFF]（/.test(candidate));
  assert.equal(candidateIndex(name, candidate), 1);
});

test('all duplicate names and suffixes after gaps are considered', () => {
  const projects = [{ id: 9, name: 'P（迁移2）' }, { id: 3, name: 'P' }, { id: 2, name: 'P' }, { id: 1, name: 'Other' }];
  assert.deepEqual(candidates(projects, 'P').map(c => c.project.id), [2, 3, 9]);
  assert.equal(freeName(projects, 'P'), 'P（迁移）');
  assert.equal(candidateIndex('P', 'Other（迁移）'), -1);
  assert.equal(candidateIndex('P', 'P（迁移01）'), -1);
});

test('same-service checks normalize localhost aliases, default ports and trailing slashes', () => {
  assert.equal(serviceAddress('HTTP://LOCALHOST:17861/'), serviceAddress('http://127.0.0.1:17861'));
  assert.equal(serviceAddress('http://localhost:80/'), serviceAddress('http://127.0.0.1'));
  assert.notEqual(serviceAddress('http://127.0.0.1/old'), serviceAddress('http://127.0.0.1/new'));
  assert.throws(() => serviceAddress('http://user:secret@127.0.0.1'), /账号/);
});
