const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

process.env.PORT = '8791';
// keep test data out of the real workspace
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), 'a2c-test-data-'));
process.env.ARCH2CODE_DATA_DIR = TEST_DATA_DIR;
delete process.env.GROQ_API_KEY; // keep AI provider off for tests
const { server } = require('../server/js/server.cjs');


let BASE = '';
async function j(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

describe('API', () => {
  let id;

  before(async () => {
    if (!server.listening) await new Promise((r) => server.listen(0, r));
    BASE = `http://localhost:${server.address().port}`;
  });
  after(() => new Promise((r) => {
    server.close(() => {
      try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
      r();
    });
  }));

  test('health', async () => {
    const { status, data } = await j('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.match(data.aiProvider, /demo|groq/);
  });

  test('security headers on API and SPA responses', async () => {
    for (const url of ['/api/health', '/']) {
      const res = await fetch(BASE + url);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', url);
      assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/, url);
    }
  });

  test('create → list → get roundtrip', async () => {
    const created = await j('POST', '/api/projects', { name: 'Roundtrip Test', description: 'd', technologies: ['Node'] });
    assert.equal(created.status, 201);
    id = created.data.project.project.id;
    const list = await j('GET', '/api/projects');
    assert.ok(list.data.projects.some((p) => p.id === id));
    const got = await j('GET', `/api/projects/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.data.project.project.name, 'Roundtrip Test');
  });

  test('update persists graph and survives "restart" (re-read)', async () => {
    const got = await j('GET', `/api/projects/${id}`);
    got.data.project.architecture.nodes.push({ id: 'n1', type: 'postgres', position: { x: 0, y: 0 }, data: { name: 'DB', technology: 'pg', description: '', environment: 'production', port: null, tags: [], envVarNames: [], endpoints: [], notes: '' }, meta: { width: 180, height: 64 } });
    const put = await j('PUT', `/api/projects/${id}`, got.data.project);
    assert.equal(put.status, 200);
    // re-read from disk as a fresh process would
    const again = await j('GET', `/api/projects/${id}`);
    assert.equal(again.data.project.architecture.nodes.length, 1);
    assert.equal(again.data.project.architecture.nodes[0].data.name, 'DB');
  });

  test('schema violations rejected with 422', async () => {
    const bad = { schemaVersion: '9.0.0', project: { id }, architecture: {}, metadata: {} };
    const put = await j('PUT', `/api/projects/${id}`, bad);
    assert.equal(put.status, 422);
  });

  test('template creation', async () => {
    const t = await j('POST', '/api/projects', { template: 'e-commerce', name: 'EC Test' });
    assert.equal(t.status, 201);
    assert.ok(t.data.project.architecture.nodes.length > 5);
    const del = await j('DELETE', `/api/projects/${t.data.project.project.id}`);
    assert.equal(del.status, 200);
  });

  test('validate returns issues', async () => {
    const v = await j('POST', `/api/projects/${id}/validate`);
    assert.equal(v.status, 200);
    assert.ok(Array.isArray(v.data.issues));
  });

  test('export json', async () => {
    const res = await fetch(`${BASE}/api/projects/${id}/export`);
    assert.match(res.headers.get('content-disposition'), /attachment/);
    const data = await res.json();
    assert.equal(data.schemaVersion, '1.0.0');
  });

  test('export zip contains zip signature', async () => {
    const res = await fetch(`${BASE}/api/projects/${id}/export?format=zip`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.readUInt32LE(0), 0x04034b50);
  });

  test('mermaid export is downloadable and re-importable', async () => {
    const res = await fetch(`${BASE}/api/projects/${id}/export?format=mermaid`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/plain/);
    assert.match(res.headers.get('content-disposition'), /\.mmd"/);
    const text = await res.text();
    assert.match(text, /^flowchart LR/);
    assert.match(text, /\["DB(<br\/>pg)?"\]/);

    const imp = await j('POST', `/api/projects/${id}/import/mermaid`, { text, mode: 'replace' });
    assert.equal(imp.status, 200);
    assert.equal(imp.data.stats.nodes, 1);
    assert.equal(imp.data.project.architecture.nodes[0].data.name, 'DB');
    assert.equal(imp.data.project.architecture.nodes[0].type, 'postgres');

    const merged = await j('POST', `/api/projects/${id}/import/mermaid`, {
      text: 'flowchart LR\n  cache[Redis Cache] --> orders[(Orders DB)]',
      mode: 'merge',
    });
    assert.equal(merged.status, 200);
    assert.equal(merged.data.stats.nodes, 2);
    assert.equal(merged.data.project.architecture.nodes.length, 3);

    assert.equal((await j('POST', `/api/projects/${id}/import/mermaid`, { text: 'not a diagram' })).status, 422);
    assert.equal((await j('POST', `/api/projects/${id}/import/mermaid`, { text: '   ' })).status, 400);

    // restore the single-node graph the later tests expect
    const original = merged.data.project.architecture.nodes.filter((n) => n.data.name === 'DB');
    const restored = await j('PUT', `/api/projects/${id}`, { ...merged.data.project, architecture: { nodes: original, edges: [] } });
    assert.equal(restored.status, 200);
  });

  test('path traversal id rejected', async () => {
    const { status } = await j('GET', `/api/projects/${encodeURIComponent('..%2F..%2Fserver')}`);
    assert.equal(status, 404);
  });

  test('malformed JSON body → 400', async () => {
    const res = await fetch(`${BASE}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
    assert.equal(res.status, 400);
  });

  test('demo AI fallback runs and records generation', async () => {
    const g = await j('POST', '/api/ai/generate', { prompt: 'e-commerce with kafka and redis cache and payments' });
    assert.equal(g.status, 200);
    assert.equal(g.data.mode, 'demo');
    assert.ok(g.data.proposal.nodes.length >= 3);
    assert.ok(g.data.proposal.edges.length >= 2);
    const hist = await j('GET', '/api/generations');
    assert.ok(hist.data.generations.some((x) => x.kind === 'architecture'));
  });

  test('duplicate creates an independent copy', async () => {
    const source = await j('GET', `/api/projects/${id}`);
    const dup = await j('POST', '/api/projects', { ...source.data.project, duplicate: true });
    assert.equal(dup.status, 201);
    const copy = dup.data.project;
    assert.notEqual(copy.project.id, id);
    assert.match(copy.project.name, /\(copy\)$/);
    assert.equal(copy.architecture.nodes.length, source.data.project.architecture.nodes.length);
    // mutating the copy must not touch the source
    copy.architecture.nodes[0].data.name = 'COPY-ONLY';
    const put = await j('PUT', `/api/projects/${copy.project.id}`, copy);
    assert.equal(put.status, 200);
    const again = await j('GET', `/api/projects/${id}`);
    assert.equal(again.data.project.architecture.nodes[0].data.name, 'DB');
    assert.equal((await j('DELETE', `/api/projects/${copy.project.id}`)).status, 200);
  });

  test('duplicate without a valid archive is rejected', async () => {
    const bad = await j('POST', '/api/projects', { duplicate: true, project: { id: 'x' } });
    assert.equal(bad.status, 422);
  });

  test('AI endpoint is rate limited per IP', async () => {
    let last = null;
    for (let i = 0; i < 25; i++) {
      last = await j('POST', '/api/ai/generate', { prompt: 'rate limit probe with kafka and redis' });
      if (last.status === 429) break;
    }
    assert.equal(last.status, 429);
    assert.match(last.data.error, /too many AI requests/);
  });

  test('delete project removes it', async () => {
    const del = await j('DELETE', `/api/projects/${id}`);
    assert.equal(del.status, 200);
    const got = await j('GET', `/api/projects/${id}`);
    assert.equal(got.status, 404);
  });
});
