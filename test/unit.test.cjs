const { test, describe } = require('node:test');
const assert = require('node:assert');
const { makeNode, makeEdge, makeProject, SCHEMA_VERSION } = require('../shared/js/types.cjs');
const { validateProject, validateCreatePayload } = require('../shared/js/schema.cjs');
const { validateArchitecture } = require('../shared/js/validate.cjs');
const { TEMPLATES, instantiateTemplate } = require('../shared/js/templates.cjs');
const { generateProject, hash32 } = require('../shared/js/codegen.cjs');
const { writeZip, crc32 } = require('../shared/js/zipwriter.cjs');
const { CATALOG } = require('../shared/js/catalog.cjs');

describe('schema validation', () => {
  test('valid project passes', () => {
    const p = makeProject({ id: 'proj-1', name: 'Test', nodes: [makeNode('n1', 'web-app', 'Client', 0, 0)], edges: [] });
    const v = validateProject(p);
    assert.equal(v.ok, true);
  });
  test('rejects missing name / unknown type / bad edge refs', () => {
    const p = makeProject({ id: 'proj-1', name: 'Test', nodes: [makeNode('n1', 'not-a-type', '', 0, 0)], edges: [makeEdge('e1', 'n1', 'ghost', 'sync-call')] });
    const v = validateProject(p);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /unknown type/.test(e.issue)));
    assert.ok(v.errors.some((e) => /missing node name|node missing id|unknown target/.test(e.issue)));
  });
  test('rejects duplicate node ids', () => {
    const p = makeProject({ id: 'x', name: 'T', nodes: [makeNode('n1', 'redis', 'A', 0, 0), makeNode('n1', 'redis', 'B', 0, 0)], edges: [] });
    const v = validateProject(p);
    assert.ok(v.errors.some((e) => /duplicate node id/.test(e.issue)));
  });
  test('rejects wrong schemaVersion', () => {
    const p = makeProject({ id: 'x', name: 'T', nodes: [], edges: [] });
    p.schemaVersion = '9.9.9';
    assert.equal(validateProject(p).ok, false);
  });
  test('create payload rules', () => {
    assert.equal(validateCreatePayload({ name: 'ok' }).ok, true);
    assert.equal(validateCreatePayload({}).ok, false);
    assert.equal(validateCreatePayload({ name: 'x'.repeat(200) }).ok, false);
    assert.equal(validateCreatePayload({ name: 'bad\nname' }).ok, false);
  });
});

describe('validation engine', () => {
  test('flags disconnected and cycle', () => {
    const nodes = [
      makeNode('a', 'web-app', 'A', 0, 0),
      makeNode('b', 'backend-service', 'B', 100, 0),
      makeNode('c', 'backend-service', 'C', 200, 0),
      makeNode('d', 'redis', 'D', 300, 0),
    ];
    // cycle b<->c ; d disconnected; b has no egress to data stores reachable?
    const edges = [makeEdge('e1', 'b', 'c'), makeEdge('e2', 'c', 'b')];
    const { issues, errorCount } = validateArchitecture({ nodes, edges });
    assert.ok(errorCount === 0);
    assert.ok(issues.some((i) => /disconnected from the rest/.test(i.message) && i.nodeIds.includes('d')));
    assert.ok(issues.some((i) => /cycle/i.test(i.message)));
  });
  test('a healthy chain has no errors', () => {
    const nodes = [makeNode('c', 'web-app', 'Client', 0, 0), makeNode('a', 'backend-service', 'API', 100, 0), makeNode('db', 'postgres', 'DB', 200, 0)];
    const edges = [makeEdge('e1', 'c', 'a'), makeEdge('e2', 'a', 'db', 'data-write')];
    const r = validateArchitecture({ nodes, edges });
    assert.equal(r.errorCount, 0);
  });
  test('self-connection is an error', () => {
    const nodes = [makeNode('x', 'api-gateway', 'GW', 0, 0)];
    const { issues } = validateArchitecture({ nodes, edges: [makeEdge('e', 'x', 'x')] });
    assert.ok(issues.some((i) => /itself/.test(i.message)));
  });
});

describe('templates instantiate real canonical graphs', () => {
  for (const key of Object.keys(TEMPLATES)) {
    test(`${key} builds valid project`, () => {
      const inst = instantiateTemplate(key, { projectId: 'proj-abc', name: 'x' });
      const v = validateProject(inst.project);
      assert.equal(v.ok, true, JSON.stringify(v.errors));
      assert.ok(inst.project.architecture.nodes.length >= 4);
      assert.ok(inst.project.architecture.edges.length >= 3);
      assert.ok(validateArchitecture(inst.project.architecture).errorCount === 0);
    });
  }
});

describe('codegen', () => {
  const inst = instantiateTemplate('basic-rest-api', { projectId: 'p1', name: 'Demo API' });
  test('generates core files', () => {
    const g = generateProject(inst.project.architecture, { projectName: 'Demo API' });
    const paths = g.files.map((f) => f.path);
    assert.ok(paths.some((p) => /package\.json$/.test(p)));
    assert.ok(paths.some((p) => /tsconfig\.json$/.test(p)));
    assert.ok(paths.some((p) => /src\/index\.ts$/.test(p)));
    assert.ok(paths.includes('README.md'));
    assert.ok(paths.includes('manifest.json'));
  });
  test('deterministic for same architecture', () => {
    const a = generateProject(inst.project.architecture, { projectName: 'Demo API' });
    const b = generateProject(inst.project.architecture, { projectName: 'Demo API' });
    assert.equal(hash32(JSON.stringify(inst.project.architecture)), hash32(JSON.stringify(inst.project.architecture)));
    assert.deepEqual(a.files.map((f) => f.path), b.files.map((f) => f.path));
  });
});

describe('zip writer', () => {
  test('produces valid zip structure and correct CRC', () => {
    const buf = writeZip([{ path: 'a.txt', content: 'hello world' }, { path: 'sub/b.txt', content: 'x'.repeat(100) }]);
    assert.equal(buf.readUInt32LE(0), 0x04034b50);
    assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
    const localCRC = buf.readUInt32LE(14);
    assert.equal(localCRC, crc32(Buffer.from('hello world')));
  });
  test('crc32 known value', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
  });
});

describe('catalog sanity', () => {
  test('every component type has a category & icon', () => {
    for (const [k, v] of Object.entries(CATALOG)) {
      assert.ok(v.category, `missing category for ${k}`);
      assert.ok(v.icon && v.label);
    }
  });
});
