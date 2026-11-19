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
const { toMermaid, parseMermaid } = require('../../shared/js/mermaid.cjs');

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = process.env.ARCH2CODE_DATA_DIR
  ? path.resolve(process.env.ARCH2CODE_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const GEN_DIR = path.join(DATA_DIR, 'generations');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const MAX_BODY = 4 * 1024 * 1024; // 4 MB
// DEMO_MODE=1 forces the deterministic generator even when a provider key is set.
// AI_FALLBACK=off makes provider failures return 502 instead of a labeled demo proposal.
const FORCE_DEMO = String(process.env.DEMO_MODE || '') === '1';
const AI_FALLBACK = String(process.env.AI_FALLBACK || 'on').toLowerCase() !== 'off';
const AI_RATE_LIMIT = Number(process.env.AI_RATE_LIMIT) > 0 ? Number(process.env.AI_RATE_LIMIT) : 12;
const AI_RATE_WINDOW_MS = 5 * 60 * 1000;

/* ---------- security headers ---------- */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src https://stackblitz.com",
    "form-action 'self' https://stackblitz.com",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
  ].join('; '),
};

function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

/* ---------- AI rate limiting (per IP, sliding window) ---------- */
const aiHits = new Map();
function aiRateLimited(ip) {
  const now = Date.now();
  const hits = (aiHits.get(ip) || []).filter((t) => now - t < AI_RATE_WINDOW_MS);
  if (hits.length >= AI_RATE_LIMIT) {
    aiHits.set(ip, hits);
    return Math.ceil((AI_RATE_WINDOW_MS - (now - hits[0])) / 1000);
  }
  hits.push(now);
  aiHits.set(ip, hits);
  if (aiHits.size > 1000) {
    for (const [k, v] of aiHits) if (!v.some((t) => now - t < AI_RATE_WINDOW_MS)) aiHits.delete(k);
  }
  return 0;
}

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
  ensureDirs();
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

  const started = Date.now();
  const liveAi = Boolean(process.env.GROQ_API_KEY) && !FORCE_DEMO;
  let result;
  let mode;
  let warning = null;
  let providerError = null;

  try {
    if (liveAi) {
      try {
        result = await generateArchitecture(body);
        mode = 'groq';
      } catch (e) {
        // Demo-day safety net: a dead network/quota must not kill the demo.
        // The response is explicitly labeled so it never masquerades as model output.
        if (!AI_FALLBACK) throw e;
        result = generateDemoProposal(body);
        mode = 'demo-fallback';
        providerError = String(e.message).replace(/\s+/g, ' ').slice(0, 200);
        warning = `AI provider unavailable (${providerError}) — showing the deterministic demo proposal instead.`;
        console.warn('[arch2code] AI provider failed, used demo fallback:', e.message);
      }
    } else {
      result = generateDemoProposal(body);
      mode = 'demo';
    }
  } catch (e) {
    const record = {
      id: uid('gen'), kind: 'architecture', projectId: body.projectId || null,
      timestamp: new Date().toISOString(), status: 'failed',
      provider: liveAi ? 'groq' : 'demo', error: e.message, durationMs: Date.now() - started,
    };
    persistGeneration(record);
    return send(res, 502, { error: `AI generation failed: ${e.message}` });
  }

  const record = {
    id: uid('gen'), kind: 'architecture', projectId: body.projectId || null,
    timestamp: new Date().toISOString(), status: providerError ? 'fallback' : 'success', provider: mode,
    model: result.model, durationMs: Date.now() - started,
    nodeCount: result.proposal.nodes.length, edgeCount: result.proposal.edges.length,
    ...(providerError ? { providerError } : {}),
  };
  persistGeneration(record);
  return send(res, 200, { mode, ...(warning ? { warning, providerError } : {}), ...result });
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
  applySecurityHeaders(res);

  try {
    if (p === '/api/health' && method === 'GET') {
      const liveAi = Boolean(process.env.GROQ_API_KEY) && !FORCE_DEMO;
      return send(res, 200, {
        ok: true, server: 'arch2code', time: new Date().toISOString(),
        aiProvider: liveAi ? 'groq' : (FORCE_DEMO ? 'demo (forced by DEMO_MODE)' : 'demo (no provider configured)'),
        demoMode: !liveAi,
        aiFallback: liveAi && AI_FALLBACK,
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

      // Duplicate = full archive posted with duplicate:true. Server assigns a fresh
      // identity and a unique name so the client can never overwrite the source.
      if (body && body.duplicate === true) {
        const archive = { ...body };
        delete archive.duplicate;
        const v = validateProject(archive);
        if (!v.ok) return send(res, 422, { error: 'invalid project archive', detail: v.errors });
        const now = new Date().toISOString();
        const clone = {
          ...v.project,
          project: {
            ...v.project.project,
            id: uid('proj'),
            name: uniqueProjectName(stripCopySuffix(v.project.project.name)),
            createdAt: now,
            updatedAt: now,
          },
        };
        const v2 = validateProject(clone);
        if (!v2.ok) return send(res, 500, { error: 'internal schema error', detail: v2.errors });
        writeProject(v2.project);
        return send(res, 201, { project: v2.project });
      }

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

    if ((m = p.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/import\/mermaid$/)) && method === 'POST') {
      const r = readProject(m[1]);
      if (!r.ok) return send(res, r.status, r.body);
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
      catch (e) { return send(res, e.statusCode || 400, { error: e.message }); }
      const text = typeof body.text === 'string' ? body.text : '';
      if (!text.trim()) return send(res, 400, { error: 'Mermaid text is required' });
      if (text.length > 200 * 1024) return send(res, 413, { error: 'Mermaid text too large (max 200 KB)' });

      const mode = body.mode === 'merge' ? 'merge' : 'replace';
      const parsed = parseMermaid(text);
      if (!parsed.nodes.length) {
        return send(res, 422, { error: 'no nodes found in the Mermaid text', detail: parsed.warnings });
      }

      let architecture;
      if (mode === 'merge') {
        // keep both graphs readable: shift the incoming diagram to the right of the existing one
        const maxX = r.project.architecture.nodes.reduce((mx, n) => Math.max(mx, Number(n.position?.x) || 0), 0);
        const dx = r.project.architecture.nodes.length ? maxX + 320 : 0;
        for (const n of parsed.nodes) n.position = { x: n.position.x + dx, y: n.position.y };
        architecture = {
          nodes: [...r.project.architecture.nodes, ...parsed.nodes],
          edges: [...r.project.architecture.edges, ...parsed.edges],
        };
      } else {
        architecture = { nodes: parsed.nodes, edges: parsed.edges };
      }

      const next = validateProject({
        ...r.project,
        project: { ...r.project.project, updatedAt: new Date().toISOString() },
        architecture,
      });
      if (!next.ok) return send(res, 422, { error: 'imported diagram failed validation', detail: next.errors });
      writeProject(next.project);
      return send(res, 200, {
        project: next.project,
        mode,
        stats: { nodes: parsed.nodes.length, edges: parsed.edges.length },
        warnings: parsed.warnings,
      });
    }

    if ((m = p.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/code$/)) && method === 'GET') {
      const r = readProject(m[1]);
      if (!r.ok) return send(res, r.status, r.body);
      const gen = generateCode(r.project.architecture, { projectName: r.project.project.name });
      const files = gen.files.map((f) => ({ path: f.path, content: f.content, bytes: Buffer.byteLength(f.content) }));
      return send(res, 200, {
        target: gen.target,
        files,
        skipped: gen.skipped || [],
        stats: { files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) },
      });
    }

    if ((m = p.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/export$/)) && (method === 'GET' || method === 'POST')) {
      const r = readProject(m[1]);
      if (!r.ok) return send(res, r.status, r.body);
      const format = url.searchParams.get('format') || 'json';
      if (format === 'mermaid') {
        const direction = (url.searchParams.get('direction') || 'LR').toUpperCase();
        const diagram = toMermaid(r.project.architecture, { direction });
        return send(res, 200, diagram, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slug(r.project.project.name)}.mmd"`,
        });
      }
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

    if (p === '/api/ai/generate' && method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      const retryAfter = aiRateLimited(ip);
      if (retryAfter > 0) {
        return send(res, 429, { error: `too many AI requests — retry in ${retryAfter}s` }, { 'Retry-After': String(retryAfter) });
      }
      return handleAi(req, res, url);
    }

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

/** "Order System (copy) (copy)" → "Order System" so repeated duplicates don't stack suffixes. */
function stripCopySuffix(name) {
  return String(name || 'Untitled').replace(/(\s*\(copy(?: \d+)?\))+$/i, '').trim() || 'Untitled';
}

function uniqueProjectName(base) {
  const existing = new Set(listProjects().map((p) => p.project.name));
  if (!existing.has(base)) return base;
  const candidate = `${base} (copy)`;
  if (!existing.has(candidate)) return candidate;
  for (let i = 2; i < 500; i++) {
    const next = `${base} (copy ${i})`;
    if (!existing.has(next)) return next;
  }
  return `${base} (copy ${Date.now()})`;
}

function slug(s) {
  return String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

if (require.main === module) {
  ensureDirs();
  server.listen(PORT, () => {
    console.log(`[arch2code] server on http://localhost:${PORT}`);
  console.log(`[arch2code] AI provider: ${process.env.GROQ_API_KEY ? 'Groq (live)' : 'demo fallback (no provider configured)'}`);
  console.log(`[arch2code] data dir: ${DATA_DIR}`);
  });
}

module.exports = { server };
