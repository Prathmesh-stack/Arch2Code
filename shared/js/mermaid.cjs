/**
 * Mermaid flowchart <-> architecture graph.
 *
 * Export is lossless for the fields that make up the graph semantics: node
 * names, component types, technologies, edges, labels and relationship types.
 * Types/technologies/relationships are carried in valid Mermaid comments
 * (`%% ...`), so any other Mermaid renderer still shows a clean diagram while
 * Arch2Code can round-trip exactly.
 *
 * Import accepts ordinary Mermaid flowcharts (shapes, chains, labeled links,
 * subgraphs flattened) and infers the component type from the label.
 */
const { makeNode, makeEdge, COMPONENT_TYPES, RELATIONSHIP_TYPES } = require('./types.cjs');
const { uid } = require('./templates.cjs');

const NODE_W = 180;
const NODE_H = 64;

/* ------------------------------- export ------------------------------- */

function cleanLabel(text) {
  return String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/["`]/g, "'")
    .replace(/\|/g, '/')
    .trim();
}

/**
 * @param {{nodes:Array, edges:Array}} architecture
 * @param {{direction?: 'LR'|'TD'}} [opts]
 */
function toMermaid(architecture, opts = {}) {
  const nodes = Array.isArray(architecture?.nodes) ? architecture.nodes : [];
  const edges = Array.isArray(architecture?.edges) ? architecture.edges : [];
  const direction = ['TD', 'TB', 'LR', 'RL', 'BT'].includes(String(opts.direction).toUpperCase())
    ? String(opts.direction).toUpperCase()
    : 'LR';
  const mermaidId = new Map();
  nodes.forEach((n, i) => mermaidId.set(n.id, `n${i}`));

  const lines = [`flowchart ${direction}`, '  %% arch2code:v1'];
  for (const n of nodes) {
    const id = mermaidId.get(n.id);
    const name = cleanLabel(n.data?.name || n.type);
    const tech = cleanLabel(n.data?.technology);
    const label = tech ? `${name}<br/>${tech}` : name;
    lines.push(`  ${id}["${label}"]`);
    lines.push(`  %% type ${id} ${n.type}`);
    if (tech) lines.push(`  %% tech ${id} ${tech}`);
  }
  for (const e of edges) {
    const s = mermaidId.get(e.source);
    const t = mermaidId.get(e.target);
    if (!s || !t) continue; // dangling edges are validation's job, not export's
    const rel = RELATIONSHIP_TYPES.includes(e.relationship) ? e.relationship : 'sync-call';
    const arrow = rel === 'async-event' ? '-.->' : rel === 'data-write' ? '==>' : '-->';
    const label = cleanLabel(e.label);
    lines.push(`  ${s} ${arrow}${label ? `|"${label}"|` : ''} ${t}`);
    if (rel !== 'sync-call') lines.push(`  %% rel ${s} ${t} ${rel}`);
  }
  return lines.join('\n') + '\n';
}

/* ------------------------------- import ------------------------------- */

const TYPE_KEYWORDS = [
  [/postgres|psql|pg\b/i, 'postgres'],
  [/mysql|mariadb/i, 'mysql'],
  [/mongo/i, 'mongodb'],
  [/redis|memcache|^cache\b|cache$/i, 'redis'],
  [/kafka|event stream|streaming platform/i, 'kafka'],
  [/queue|rabbit|sqs|amqp/i, 'message-queue'],
  [/event bus|nats|pub\/?sub/i, 'event-bus'],
  [/api gateway|gateway|nginx|reverse proxy|envoy/i, 'api-gateway'],
  [/load balancer|\balb\b|\belb\b|haproxy/i, 'load-balancer'],
  [/auth|identity|keycloak|oauth|login/i, 'auth-service'],
  [/authorization|permission|\brbac\b|\bacl\b/i, 'authz-service'],
  [/secret|vault\b/i, 'secrets-manager'],
  [/mobile|android|\bios\b/i, 'mobile-app'],
  [/web app|website|web ui|react|vue|angular|next\.js|frontend|front-end|dashboard ui/i, 'web-app'],
  [/frontend|single page/i, 'frontend'],
  [/\bcdn\b|cloudfront|akamai/i, 'cdn'],
  [/kubernetes|\bk8s\b|\beks\b|\bgke\b|\baks\b/i, 'kubernetes-cluster'],
  [/docker|container/i, 'docker-container'],
  [/object storage|\bs3\b|\bblob\b|gcs bucket/i, 'object-storage'],
  [/warehouse|snowflake|bigquery|redshift/i, 'data-warehouse'],
  [/serverless|lambda|cloud function/i, 'serverless-function'],
  [/payment|stripe|checkout/i, 'payment-provider'],
  [/email|smtp|ses\b|sendgrid|resend|notification/i, 'email-service'],
  [/\bcloud\b|\baws\b|\bazure\b|\bgcp\b/i, 'cloud-service'],
  [/third.?party|external api|vendor|webhook/i, 'third-party-api'],
];

function inferType(label, tech) {
  const haystack = `${label || ''} ${tech || ''}`.trim();
  for (const [re, type] of TYPE_KEYWORDS) if (re.test(haystack) && COMPONENT_TYPES.includes(type)) return type;
  return 'backend-service';
}

const EDGE_RE = /(\s*(?:-{2,3}>?|-\.+->?|={2,3}>?)\s*(?:\|([^|]*)\|)?\s*)/g;

function normalizeLinkLabels(line) {
  return line
    .replace(/--\s*([^|>\n]+?)\s*-->/g, (m, l) => ` -->|${l.trim()}| `)
    .replace(/-\.\s*([^|>\n]+?)\s*\.->/g, (m, l) => ` -.->|${l.trim()}| `)
    .replace(/==\s*([^|>\n]+?)\s*==>/g, (m, l) => ` ==>|${l.trim()}| `);
}

function inferRelationship(linkToken) {
  const t = String(linkToken || '');
  if (t.includes('.')) return 'async-event';
  if (t.includes('=')) return 'data-write';
  return 'sync-call';
}

function decodeLabel(raw) {
  let s = String(raw || '').trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length > 1) s = s.slice(1, -1);
  s = s
    .replace(/<br\s*\/?>|\\n/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  return s;
}

/** @returns {{id:string,label:string}|null} */
function parseEndpoint(token) {
  const s = String(token || '').trim().replace(/:::[\w-]+$/g, '').trim();
  if (!s) return null;
  const shapes = [
    /^([A-Za-z0-9_][\w-]*)\s*\(\((.*)\)\)$/s, // ((circle))
    /^([A-Za-z0-9_][\w-]*)\s*\[\((.*)\)\]$/s, // [(cylinder)]
    /^([A-Za-z0-9_][\w-]*)\s*\[\[(.*)\]\]$/s, // [[subroutine]]
    /^([A-Za-z0-9_][\w-]*)\s*\[\/(.*)\/\]$/s, // [/parallelogram/]
    /^([A-Za-z0-9_][\w-]*)\s*\{\{(.*)\}\}$/s, // {{hexagon}}
    /^([A-Za-z0-9_][\w-]*)\s*\{(.*)\}$/s, // {rhombus}
    /^([A-Za-z0-9_][\w-]*)\s*\[(.*)\]$/s, // [rect]
    /^([A-Za-z0-9_][\w-]*)\s*\((.*)\)$/s, // (rounded)
    /^([A-Za-z0-9_][\w-]*)\s*>(.*)\]$/s, // >asymmetric]
    /^([A-Za-z0-9_][\w-]*)$/s, // bare id
  ];
  for (const re of shapes) {
    const m = s.match(re);
    // A bare id (as used inside edge statements) carries no label of its own —
    // it must not overwrite a label declared on a separate definition line.
    if (m) return { id: m[1], label: m.length > 2 ? decodeLabel(m[2]) : '' };
  }
  return null;
}

function layerPositions(nodes, edges, direction) {
  const ids = nodes.map((n) => n.id);
  const layer = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, []]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  const seenPair = new Set();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (seenPair.has(key) || !layer.has(e.source) || !layer.has(e.target)) continue;
    seenPair.add(key);
    outgoing.get(e.source).push(e.target);
    indeg.set(e.target, indeg.get(e.target) + 1);
  }
  // Kahn layering; remaining nodes (cycles) go into the last real layer.
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const order = [];
  const deg = new Map(indeg);
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of outgoing.get(id)) {
      layer.set(next, Math.max(layer.get(next), layer.get(id) + 1));
      deg.set(next, deg.get(next) - 1);
      if (deg.get(next) === 0) queue.push(next);
    }
  }
  const maxLayer = Math.max(0, ...[...layer.values()]);
  for (const id of ids) if (!order.includes(id)) layer.set(id, maxLayer);

  const byLayer = new Map();
  for (const n of nodes) {
    const l = layer.get(n.id);
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(n.id);
  }
  const vertical = direction === 'TD' || direction === 'TB' || direction === 'BT';
  const positions = new Map();
  for (const [l, list] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((id, i) => {
      const spread = (i - (list.length - 1) / 2) * (NODE_H + 70);
      positions.set(id, vertical
        ? { x: Math.round(380 + spread), y: 90 + l * 150 }
        : { x: 80 + l * 260, y: Math.round(120 + spread) });
    });
  }
  return positions;
}

/**
 * Parse Mermaid flowchart text into a canonical architecture graph.
 * Never throws for malformed input: reports warnings instead.
 * @returns {{nodes:Array, edges:Array, warnings:string[], direction:string}}
 */
function parseMermaid(text) {
  const warnings = [];
  let direction = 'LR';
  const metaType = new Map();
  const metaTech = new Map();
  const metaRel = new Map();

  const rawLines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const statements = [];
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^%%/.test(line)) {
      const typeM = line.match(/^%%\s*type\s+([\w-]+)\s+([\w-]+)\s*$/i);
      if (typeM && COMPONENT_TYPES.includes(typeM[2])) metaType.set(typeM[1], typeM[2]);
      const techM = line.match(/^%%\s*tech\s+([\w-]+)\s+(.+)$/i);
      if (techM) metaTech.set(techM[1], decodeLabel(techM[2]));
      const relM = line.match(/^%%\s*rel\s+([\w-]+)\s+([\w-]+)\s+([\w-]+)\s*$/i);
      if (relM && RELATIONSHIP_TYPES.includes(relM[3])) metaRel.set(`${relM[1]}->${relM[2]}`, relM[3]);
      continue; // every other comment (incl. arch2code:v1 header) is ignored
    }
    if (/^(flowchart|graph)\b/i.test(line)) {
      const d = line.match(/^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)/i);
      if (d) direction = d[1].toUpperCase();
      continue;
    }
    if (/^(classDef|class|style|linkStyle|click|direction)\b/i.test(line)) continue;
    if (/^subgraph\b/i.test(line)) { warnings.push('Subgraph treated as a plain group (nodes imported flat).'); continue; }
    if (/^end$/i.test(line)) continue;
    for (const stmt of line.split(';')) {
      const s = stmt.trim();
      if (s) statements.push(s);
    }
  }

  /** @type {Map<string, {id:string,label:string}>} */
  const parsed = new Map();
  const rawEdges = [];
  const touch = (ep, fallbackLabel) => {
    if (!ep) return null;
    if (!parsed.has(ep.id)) parsed.set(ep.id, { id: ep.id, label: ep.label || fallbackLabel || ep.id });
    else if (ep.label) parsed.get(ep.id).label = ep.label;
    return ep.id;
  };

  for (const stmt of statements) {
    const normalized = normalizeLinkLabels(stmt);
    const parts = normalized.split(EDGE_RE);
    // split() with a capturing group yields: endpoint, link, label, endpoint, link, label, ...
    const endpoints = [];
    const links = [];
    const linkTokens = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 3 === 0) endpoints.push(parts[i]);
      else if (i % 3 === 1) linkTokens.push(parts[i] || '');
      else links.push(parts[i] || '');
    }
    if (endpoints.length === 0) continue;
    const ids = endpoints.map((ep) => touch(parseEndpoint(ep))).filter(Boolean);
    if (ids.length === 0) {
      warnings.push(`Ignored unsupported statement: ${stmt.slice(0, 80)}`);
      continue;
    }
    for (let i = 0; i + 1 < ids.length; i++) {
      rawEdges.push({
        source: ids[i], target: ids[i + 1],
        label: decodeLabel(links[i] || ''),
        relationship: inferRelationship(linkTokens[i]),
      });
    }
  }

  if (parsed.size === 0) {
    return { nodes: [], edges: [], warnings: ['No nodes found — expected a Mermaid flowchart (for example "flowchart LR" followed by "A[Web App] --> B[(Database)]").'], direction };
  }

  const nodes = [];
  const byMermaidId = new Map();
  for (const p of parsed.values()) {
    const label = p.label || p.id;
    const nameLines = label.split('\n');
    const name = (nameLines[0] || p.id).slice(0, 80) || p.id;
    const techFromLabel = nameLines.slice(1).join(' ').trim();
    const tech = metaTech.get(p.id) || techFromLabel;
    const type = metaType.get(p.id) || inferType(name, tech);
    const node = makeNode(uid('n'), type, name, 0, 0, { technology: tech.slice(0, 60) });
    nodes.push(node);
    byMermaidId.set(p.id, node);
  }

  const positions = layerPositions(
    nodes.map((n) => ({ id: n.id })),
    rawEdges.map((e) => ({ source: byMermaidId.get(e.source)?.id, target: byMermaidId.get(e.target)?.id })).filter((e) => e.source && e.target),
    direction
  );
  for (const n of nodes) n.position = positions.get(n.id) || { x: 0, y: 0 };

  const edges = [];
  const seen = new Set();
  for (const e of rawEdges) {
    const s = byMermaidId.get(e.source);
    const t = byMermaidId.get(e.target);
    if (!s || !t) continue;
    if (s.id === t.id) { warnings.push(`Self-connection on "${s.data.name}" skipped.`); continue; }
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const relationship = metaRel.get(key) || e.relationship || 'sync-call';
    edges.push(makeEdge(uid('e'), s.id, t.id, relationship, e.label.slice(0, 60)));
  }

  return { nodes, edges, warnings, direction };
}

module.exports = { toMermaid, parseMermaid, inferType };
