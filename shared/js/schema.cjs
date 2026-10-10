const { SCHEMA_VERSION, COMPONENT_TYPES, RELATIONSHIP_TYPES } = require('./types.cjs');

/**
 * Validate a project archive object (as deserialized from JSON).
 * Returns { ok, errors[], project? } — errors have path + issue.
 */
function validateProject(archive) {
  const errors = [];
  if (typeof archive !== 'object' || archive === null || Array.isArray(archive)) {
    return { ok: false, errors: [{ path: '$', issue: 'payload is not an object' }] };
  }
  if (typeof archive.schemaVersion !== 'string') {
    errors.push({ path: 'schemaVersion', issue: 'missing schemaVersion string' });
  } else if (archive.schemaVersion !== SCHEMA_VERSION) {
    errors.push({ path: 'schemaVersion', issue: `unsupported schemaVersion ${archive.schemaVersion}` });
  }
  const p = archive.project || {};
  if (typeof p.id !== 'string' || !p.id) errors.push({ path: 'project.id', issue: 'missing id' });
  if (typeof p.name !== 'string' || !p.name) errors.push({ path: 'project.name', issue: 'missing name' });
  if (p.createdAt && isNaN(Date.parse(p.createdAt))) errors.push({ path: 'project.createdAt', issue: 'invalid ISO date' });
  if (p.updatedAt && isNaN(Date.parse(p.updatedAt))) errors.push({ path: 'project.updatedAt', issue: 'invalid ISO date' });

  if (!archive.architecture || typeof archive.architecture !== 'object') {
    return { ok: false, errors: [{ path: 'architecture', issue: 'missing architecture object' }] };
  }
  const nodes = archive.architecture.nodes;
  const edges = archive.architecture.edges;
  if (!Array.isArray(nodes)) errors.push({ path: 'architecture.nodes', issue: 'nodes must be an array' });
  if (!Array.isArray(edges)) errors.push({ path: 'architecture.edges', issue: 'edges must be an array' });
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return { ok: false, errors };
  }

  const seenIds = [];
  for (const n of nodes) {
    if (typeof n.id !== 'string' || !n.id) { errors.push({ path: '$.node', issue: 'node missing id' }); continue; }
    if (seenIds.includes(n.id)) errors.push({ path: `nodes.${n.id}`, issue: 'duplicate node id' });
    seenIds.push(n.id);
    if (!COMPONENT_TYPES.includes(n.type)) errors.push({ path: `nodes.${n.id}.type`, issue: `unknown type ${n.type}` });
    if (!n.position || !isFinite(Number(n.position.x)) || !isFinite(Number(n.position.y))) {
      errors.push({ path: `nodes.${n.id}.position`, issue: 'invalid position' });
    }
    if (!n.data || typeof n.data.name !== 'string' || !n.data.name) {
      errors.push({ path: `nodes.${n.id}.data.name`, issue: 'missing node name' });
    }
    if (n.data && n.data.port != null && !isFinite(Number(n.data.port))) {
      errors.push({ path: `nodes.${n.id}.data.port`, issue: 'port must be a number' });
    }
  }
  const nodeIds = new Set(seenIds);
  const edgeIds = [];
  for (const e of edges) {
    if (typeof e.id !== 'string' || !e.id) { errors.push({ path: '$.edge', issue: 'edge missing id' }); continue; }
    if (edgeIds.includes(e.id)) errors.push({ path: `edges.${e.id}`, issue: 'duplicate edge id' });
    edgeIds.push(e.id);
    if (!nodeIds.has(e.source)) errors.push({ path: `edges.${e.id}.source`, issue: `unknown source ${e.source}` });
    if (!nodeIds.has(e.target)) errors.push({ path: `edges.${e.id}.target`, issue: `unknown target ${e.target}` });
    if (e.relationship && !RELATIONSHIP_TYPES.includes(e.relationship)) {
      errors.push({ path: `edges.${e.id}.relationship`, issue: `unknown relationship ${e.relationship}` });
    }
    if (e.label != null && typeof e.label !== 'string') {
      errors.push({ path: `edges.${e.id}.label`, issue: 'label must be a string' });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors, project: normalize(archive) };
}

function normalize(archive) {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: String(archive.project.id),
      name: String(archive.project.name),
      description: String(archive.project.description || ''),
      status: archive.project.status || 'in-progress',
      createdAt: archive.project.createdAt || new Date().toISOString(),
      updatedAt: archive.project.updatedAt || new Date().toISOString(),
    },
    architecture: { nodes: archive.architecture.nodes, edges: archive.architecture.edges },
    metadata: {
      technologies: Array.isArray(archive.metadata?.technologies) ? archive.metadata.technologies : [],
      version: Number(archive.metadata?.version) || 1,
    },
  };
}

/**
 * Validate a plain {name,description,technologies,...} create payload.
 * Not the full archive — that's validated on save.
 */
function validateCreatePayload(body) {
  const errors = [];
  if (typeof body?.name !== 'string' || body.name.trim().length < 1) {
    errors.push({ path: 'name', issue: 'name is required' });
  }
  if (body?.name && body.name.length > 120) errors.push({ path: 'name', issue: 'name too long (max 120)' });
  if (body?.name && /[\u0000-\u001f]/.test(body.name)) errors.push({ path: 'name', issue: 'control chars rejected' });
  if (body?.description && (typeof body.description !== 'string' || body.description.length > 2000)) {
    errors.push({ path: 'description', issue: 'description too long (max 2000)' });
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { validateProject, validateCreatePayload };
