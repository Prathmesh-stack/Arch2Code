const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { SCHEMA_VERSION, makeProject } = require('../../shared/js/types.cjs');
const { validateProject, validateCreatePayload } = require('../../shared/js/schema.cjs');
const { validateArchitecture } = require('../../shared/js/validate.cjs');
const { TEMPLATES, instantiateTemplate, uid } = require('../../shared/js/templates.cjs');
const { generateProject: generateCode } = require('../../shared/js/codegen.cjs');
const { writeZip } = require('../../shared/js/zipwriter.cjs');
const { generateArchitecture, generateDemoProposal } = require('./ai.cjs');

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const GEN_DIR = path.join(DATA_DIR, 'generations');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const MAX_BODY = 4 * 1024 * 1024; // 4 MB

function ensureDirs() {
  for (const d of [DATA_DIR, PROJECTS_DIR, GEN_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

/* ---------- storage: one file per project, atomic replace ---------- */
function projectPath(id) {
  // Never allow arbitrary paths: ids are Sanitized to a safe charset.
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null;
  return path.join(PROJECTS_DIR, `${id}.json`);
}

function readProject(id) {
  const p = projectPath(id);
  if (!p) return { ok: false, status: 400, body: { error: 'invalid id' } };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    const v = validateProject(parsed);
    if (!v.ok) return { ok: false, status: 500, body: { error: 'stored project failed schema validation', detail: v.errors } };
    return { ok: true, project: v.project };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, status: 404, body: { error: 'not found' } };
    // corrupted: back it up, never silently overwrite the evidence
    try { fs.copyFileSync(p, `${p}.corrupt-${Date.now()}`); } catch {}
    return { ok: false, status: 500, body: { error: 'project file corrupted (backed up); restore or delete it', detail: e.message } };
  }
}

function writeProject(archive) {
  const p = projectPath(archive.project.id);
  if (!p) return { ok: false, status: 400, body: { error: 'invalid id' } };
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(archive, null, 2));
  fs.renameSync(tmp, p); // atomic on same volume
  return { ok: true };
}

function listProjects() {
  ensureDirs();
  const out = [];
  for (const f of fs.readdirSync(PROJECTS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8'));
      const v = validateProject(parsed);
      if (v.ok) out.push(v.project);
    } catch { /* skip unreadable files, don't crash listing */ }
  }
  out.sort((a, b) => (b.project.updatedAt || '').localeCompare(a.project.updatedAt || ''));
  return out;
}

/* ---------- helpers ---------- */
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('payload too large'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleAi(req, res, url) {
  let body;
  try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
  catch (e) { return send(res, e.statusCode || 400, { error: e.message }); }
  if (typeof body.prompt !== 'string' || body.prompt.trim().length < 10) {
    return send(res, 400, { error: 'prompt must be at least 10 characters' });
  }
  if (body.prompt.length > 4000) return send(res, 413, { error: 'prompt too long (max 4000 chars)' });

  const useProvider = process.env.GROQ_API_KEY && body.mode !== 'demo';
  const started = Date.now();
  let result, mode;
  try {
    if (useProvider) {
      result = await generateArchitecture(body);
      mode = 'groq';
    } else {
      result = generateDemoProposal(body);
      mode = 'demo';
    }
  } catch (e) {
    const record = {
      id: uid('gen'), kind: 'architecture', projectId: body.projectId || null,
      timestamp: new Date().toISOString(), status: 'failed',
      provider: useProvider ? 'groq' : 'demo', error: e.message, durationMs: Date.now() - started,
    };
    persistGeneration(record);
    return send(res, 502, { error: `AI generation failed: ${e.message}` });
  }
  const record = {
    id: uid('gen'), kind: 'architecture', projectId: body.projectId || null,
    timestamp: new Date().toISOString(), status: 'success', provider: mode,
    model: result.model, durationMs: Date.now() - started,
    nodeCount: result.proposal.nodes.length, edgeCount: result.proposal.edges.length,
  };
  persistGeneration(record);
  return send(res, 200, { mode, ...result });
}

function persistGeneration(record) {
  try {
    fs.writeFileSync(path.join(GEN_DIR, `${record.id}.json`), JSON.stringify(record, null, 2));
  } catch { /* history is best-effort */ }
}

function listGenerations() {
  ensureDirs();
  const out = [];
  for (const f of fs.readdirSync(GEN_DIR)) {
    if (!f.endsWith('.json')) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(GEN_DIR, f), 'utf8'))); } catch {}
  }
  out.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return out.slice(0, 100);
}

/* ---------- router ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback for client-side routes
      if (!path.extname(rel)) {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) return send(res, 404, { error: 'not found' });
          send(res, 200, html, { 'Content-Type': MIME['.html'] });
        });
      }
      return send(res, 404, { error: 'not found' });
    }
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const method = req.method;

  try {
    if (p === '/api/health' && method === 'GET') {
      return send(res, 200, {
        ok: true, server: 'arch2code', time: new Date().toISOString(),
        aiProvider: process.env.GROQ_API_KEY ? 'groq' : 'demo (no GROQ_API_KEY)',
        schemaVersion: SCHEMA_VERSION,
      });
    }

    if (p === '/api/projects' && method === 'GET') {
      const projects = listProjects();
      return send(res, 200, { projects: projects.map((pr) => ({
        id: pr.project.id, name: pr.project.name, description: pr.project.description,
        status: pr.project.status, updatedAt: pr.project.updatedAt, createdAt: pr.project.createdAt,
        componentCount: pr.architecture.nodes.length, connectionCount: pr.architecture.edges.length,
        technologies: pr.metadata.technologies,
      })) });
    }

    if (p === '/api/projects' && method === 'POST') {
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
      catch (e) { return send(res, e.statusCode || 400, { error: e.message }); }

      if (body.template) {
        const inst = instantiateTemplate(body.template, { name: body.name, description: body.description });
        if (!inst) return send(res, 400, { error: `unknown template ${body.template}` });
        const v = validateProject(inst.project);
        if (!v.ok) return send(res, 500, { error: 'template produced invalid project' });
        writeProject(v.project);
        return send(res, 201, { project: v.project });
      }

      const chk = validateCreatePayload(body);
      if (!chk.ok) return send(res, 422, { error: 'invalid payload', detail: chk.errors });
      const now = new Date().toISOString();
      const project = makeProject({
        id: uid('proj'), name: body.name.trim(), description: body.description || '',
        nodes: [], edges: [], technologies: Array.isArray(body.technologies) ? body.technologies.slice(0, 12) : [],
        createdAt: now, updatedAt: now,
      });
      project.project.status = body.status === 'draft' ? 'draft' : 'in-progress';
      const v = validateProject(project);
      if (!v.ok) return send(res, 500, { error: 'internal schema error', detail: v.errors });
      writeProject(v.project);
      return send(res, 201, { project: v.project });
    }

    let m;
    if ((m = p.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/))) {
      const id = m[1];
      if (method === 'GET') {
        const r = readProject(id);
        return r.ok ? send(res, 200, { project: r.project }) : send(res, r.status, r.body);
      }
      if (method === 'PUT') {
        const existing = readProject(id);
        if (!existing.ok) return send(res, existing.status, existing.body);
        let body;
        try { body = JSON.parse((await readBody(req)).toString('utf8')); }
        catch (e) { return send(res, e.statusCode || 400, { error: e.message }); }
        const merged = { ...body };
        merged.schemaVersion = SCHEMA_VERSION;
        merged.project = { ...(merged.project || {}), id, updatedAt: new Date().toISOString() };
        const v = validateProject(merged);
        if (!v.ok) return send(res, 422, { error: 'schema validation failed', detail: v.errors });
        writeProject(v.project);
        return send(res, 200, { project: v.project });
      }
      if (method === 'DELETE') {
        const r = readProject(id);
        if (!r.ok) return send(res, r.status, r.body);
        const pp = projectPath(id);
        const trash = `${pp}.deleted-${Date.now()}`;
        fs.renameSync(pp, trash); // soft-delete marker; hard delete not done automatically
        try { fs.unlinkSync(trash); } catch {}
        return send(res, 200, { ok: true });
      }
    }

    if ((m = p.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/validate$/)) && method === 'POST') {
      const r = readProject(m[1]);
      if (!r.ok) return send(res, r.status, r.body);
      const result = validateArchitecture(r.project.architecture);
      return send(res, 200, result);
    }

    if ((m = p.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/export$/)) && (method === 'GET' || method === 'POST')) {
      const r = readProject(m[1]);
      if (!r.ok) return send(res, r.status, r.body);
      const format = url.searchParams.get('format') || 'json';
      if (format === 'validation-report') {
        const report = { project: r.project.project.name, generatedAt: new Date().toISOString(), ...validateArchitecture(r.project.architecture) };
        return send(res, 200, report, { 'Content-Disposition': 'attachment; filename="validation-report.json"' });
      }
      if (format === 'zip') {
        const gen = generateCode(r.project.architecture, { projectName: r.project.project.name });
        const zip = writeZip(gen.files.map((f) => ({ path: f.path, content: f.content })));
        return send(res, 200, zip, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${slug(r.project.project.name)}-scaffold.zip"`,
        });
      }
      return send(res, 200, r.project, {
        'Content-Disposition': `attachment; filename="${slug(r.project.project.name)}.arch2code.json"`,
      });
    }

    if (p === '/api/generations' && method === 'GET') return send(res, 200, { generations: listGenerations() });

    if (p === '/api/ai/generate' && method === 'POST') return handleAi(req, res, url);

    if (p === '/api/templates' && method === 'GET') {
      return send(res, 200, { templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, description: t.description })) });
    }

    if (p.startsWith('/api/')) return send(res, 404, { error: 'no such endpoint' });
    return serveStatic(res, p);
  } catch (e) {
    console.error('[arch2code] unhandled error:', e);
    if (!res.headersSent) return send(res, 500, { error: 'internal server error', detail: String(e.message || e) });
    res.end();
  }
});

function slug(s) {
  return String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

ensureDirs();
server.listen(PORT, () => {
  console.log(`[arch2code] server on http://localhost:${PORT}`);
  console.log(`[arch2code] AI provider: ${process.env.GROQ_API_KEY ? 'Groq (live)' : 'demo fallback (no GROQ_API_KEY set)'}`);
  console.log(`[arch2code] data dir: ${DATA_DIR}`);
});

module.exports = { server };
