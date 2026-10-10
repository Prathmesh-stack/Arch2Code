const { validateProject } = require('../../shared/js/schema.cjs');
const { COMPONENT_TYPES, SCHEMA_VERSION } = require('../../shared/js/types.cjs');
const { CATALOG } = require('../../shared/js/catalog.cjs');
const { uid } = require('../../shared/js/templates.cjs');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const FALLBACK_MODELS = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
const MAX_PROMPT_CHARS = 4000;

const SYSTEM_PROMPT = `You are an architecture generator. Given a natural-language system description, output ONLY a JSON object (no markdown, no commentary) with this exact shape:
{"rationale":string,"assumptions":string[],"risks":string[],"openQuestions":string[],"technologies":string[],"nodes":[{"type":one-of:["${COMPONENT_TYPES.join('","')}"],"name":string,"technology":string,"description":string}],"edges":[{"source":string,"target":string,"relationship":"sync-call"|"async-event"|"data-read"|"data-write","label":string}]}
Rules: 4-14 nodes. Every edge's source/target MUST be an existing node's name exactly. Use edges for real dependencies. Include data stores when persistence matters. Never include secrets.`;

async function generateWithGroq(payload) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('NO_PROVIDER');
  if (typeof payload.prompt !== 'string' || payload.prompt.length < 10) throw new Error('PROMPT_TOO_SHORT');
  const prompt = payload.prompt.slice(0, MAX_PROMPT_CHARS);
  const models = [MODEL, ...FALLBACK_MODELS];
  let lastErr = null;
  for (const candidate of models) {
    try {
      const text = await callGroq(apiKey, candidate, payload, prompt);
      MODEL_LAST_USED = candidate;
      return parseProposal(text);
    } catch (e) {
      lastErr = e;
      // only fall through to the next model on model-availability / rate errors; parse errors are ours-stop
      if (!/model_not_found|PROVIDER_HTTP_404|PROVIDER_HTTP_429|does not exist|PROVIDER_HTTP_400/.test(String(e.message))) throw e;
    }
  }
  throw lastErr;
}

let MODEL_LAST_USED = null;

async function callGroq(apiKey, chosenModel, payload, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: chosenModel,
        temperature: 0.2,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(payload, prompt) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`PROVIDER_HTTP_${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw new Error('PROVIDER_EMPTY_RESPONSE');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function buildUserPrompt(payload, prompt) {
  const parts = [`System requirements: ${prompt}`];
  if (Number(payload.expectedUsers) > 0) parts.push(`Expected scale: ~${payload.expectedUsers} users.`);
  if (typeof payload.constraints === 'string' && payload.constraints.trim()) {
    parts.push(`Constraints: ${payload.constraints.slice(0, 500)}`);
  }
  return parts.join('\n');
}

function parseProposal(text) {
  // Be strict: model output is untrusted.
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('MODEL_OUTPUT_NOT_JSON'); }
  if (typeof raw !== 'object' || raw === null) throw new Error('MODEL_OUTPUT_NOT_OBJECT');
  if (!Array.isArray(raw.nodes) || raw.nodes.length < 2) throw new Error('MODEL_OUTPUT_TOO_FEW_NODES');
  if (raw.nodes.length > 20) throw new Error('MODEL_OUTPUT_TOO_MANY_NODES');

  const nodes = [];
  const nameToId = new Map();
  for (const n of raw.nodes) {
    if (typeof n.type !== 'string' || !COMPONENT_TYPES.includes(n.type)) continue;
    if (typeof n.name !== 'string' || !n.name.trim()) continue;
    const id = uid('n');
    nameToId.set(n.name.trim(), id);
    const meta = CATALOG[n.type] || {};
    nodes.push({
      id, type: n.type,
      position: { x: 0, y: 0 },
      data: {
        name: n.name.trim().slice(0, 60),
        technology: typeof n.technology === 'string' ? n.technology.slice(0, 60) : '',
        description: typeof n.description === 'string' ? n.description.slice(0, 300) : '',
        environment: 'production', port: null, tags: [],
        envVarNames: [], endpoints: [], notes: '',
      },
      meta: { width: 180, height: 64 },
    });
  }
  if (nodes.length < 2) throw new Error('MODEL_OUTPUT_NO_VALID_NODES');

  const edges = [];
  const seen = new Set();
  if (Array.isArray(raw.edges)) {
    for (const e of raw.edges) {
      if (typeof e !== 'object' || e === null) continue;
      const source = typeof e.source === 'string' ? nameToId.get(e.source.trim()) : null;
      const target = typeof e.target === 'string' ? nameToId.get(e.target.trim()) : null;
      if (!source || !target || source === target) continue;
      const key = `${source}->${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: uid('e'), source, target, relationship: e.relationship, label: String(e.label || '').slice(0, 60) });
    }
  }

  // Positions: deterministic radial placement until user drags / auto-layout runs
  const R = 260, cx = 380, cy = 260;
  nodes.forEach((n, i) => {
    const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    n.position = { x: Math.round(cx + R * Math.cos(a)), y: Math.round(cy + R * Math.sin(a)) };
  });

  return {
    generator: 'groq',
    model: MODEL_LAST_USED || MODEL,
    proposal: {
      technologies: Array.isArray(raw.technologies) ? raw.technologies.map(String).slice(0, 12) : [],
      rationale: typeof raw.rationale === 'string' ? raw.rationale.slice(0, 1500) : '',
      assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(String).slice(0, 10) : [],
      risks: Array.isArray(raw.risks) ? raw.risks.map(String).slice(0, 10) : [],
      openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions.map(String).slice(0, 10) : [],
      nodes, edges,
    },
  };
}

/** Clearly-labeled deterministic fallback — never pretends to be model output. */
function generateDemoProposal(payload) {
  const p = String(payload.prompt || '').toLowerCase();
  const has = (...ws) => ws.some((w) => p.includes(w));
  const nodes = [];
  let i = 0;
  const add = (type, name, tech) => nodes.push({ id: `demo-n${i++}`, type, name, technology: tech, description: '' });
  add('web-app', 'Web App', 'React');
  add('api-gateway', 'API Gateway', 'Nginx');
  if (has('auth', 'login', 'user')) add('auth-service', 'Auth Service', 'Keycloak');
  add('backend-service', 'Order Service', 'Node.js');
  if (has('kafka', 'queue', 'event', 'async')) add('kafka', 'Kafka', 'Kafka 3');
  if (has('mongo')) add('mongodb', 'MongoDB', 'MongoDB 7');
  if (has('redis', 'cache')) add('redis', 'Redis', 'Redis 7');
  add(has('mongo') ? 'mongodb' : 'postgres', 'Primary DB', 'PostgreSQL 16');
  if (has('email', 'notification')) add('email-service', 'Email Service', 'Resend');
  const edges = [
    { source: 'Web App', target: 'API Gateway', relationship: 'sync-call', label: 'HTTPS' },
    { source: 'API Gateway', target: 'Order Service', relationship: 'sync-call', label: '' },
    { source: 'Order Service', target: 'Primary DB', relationship: 'data-write', label: 'sql' },
  ];
  if (has('redis', 'cache')) edges.push({ source: 'Order Service', target: 'Redis', relationship: 'data-read', label: 'cache' });
  if (has('kafka', 'queue', 'event', 'async')) edges.push({ source: 'Order Service', target: 'Kafka', relationship: 'async-event', label: 'events' });
  if (has('auth', 'login', 'user')) edges.push({ source: 'API Gateway', target: 'Auth Service', relationship: 'sync-call', label: 'login' });
  if (has('email', 'notification')) edges.push({ source: 'Kafka', target: 'Email Service', relationship: 'async-event', label: 'notify' });

  // same canonical shape as Groq path so validation/apply are identical
  const validEdges = [];
  const byName = new Map(nodes.map((n) => [n.name, n]));
  for (const e of edges) {
    const s = byName.get(e.source), t = byName.get(e.target);
    if (s && t && s.id !== t.id) validEdges.push({ id: uid('e'), source: s.id, target: t.id, relationship: e.relationship, label: e.label });
  }
  const R = 240, cx = 360, cy = 250;
  const placed = nodes.map((n, idx) => ({ ...n, id: n.id, position: { x: Math.round(cx + R * Math.cos((2 * Math.PI * idx) / nodes.length - Math.PI / 2)), y: Math.round(cy + R * Math.sin((2 * Math.PI * idx) / nodes.length - Math.PI / 2)) } }));
  const finalEdges = validEdges.map((e) => {
    const si = placed.findIndex((n) => n.id === e.source);
    const ti = placed.findIndex((n) => n.id === e.target);
    return { ...e, source: placed[si]?.id || e.source, target: placed[ti]?.id || e.target };
  });
  return {
    generator: 'demo (no provider configured)',
    model: null,
    proposal: {
      technologies: ['Node.js', 'React', 'PostgreSQL'],
      rationale: 'Deterministic demo template matched from keywords in your description. No language model involved.',
      assumptions: ['Single region', 'Vertical scaling adequate for demo'],
      risks: ['Demo mode does not infer real scale needs'],
      openQuestions: ['Confirm expected traffic', 'Confirm data sovereignty requirements'],
      nodes: placed.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { name: n.name, technology: n.technology, description: n.description || '', environment: 'production', port: null, tags: [], envVarNames: [], endpoints: [], notes: '' }, meta: { width: 180, height: 64 } })),
      edges: finalEdges,
    },
  };
}

async function generateArchitecture(payload) {
  const result = await generateWithGroq(payload);
  // validate the proposal against our component universe before returning
  for (const n of result.proposal.nodes) {
    if (!CATALOG[n.type]) throw new Error('PROPOSAL_INVALID_TYPE');
  }
  return result;
}

module.exports = { generateArchitecture, generateDemoProposal, MODEL };
