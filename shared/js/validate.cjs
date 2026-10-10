const { CATALOG } = require('./catalog.cjs');

/**
 * Deterministic architecture validation engine — independent of the UI.
 * Returns a list of issues: { id, severity: 'error'|'warning'|'info', message, nodeIds?, edgeIds?, hint? }
 */
function validateArchitecture(arch) {
  const { nodes = [], edges = [] } = arch || {};
  const issues = [];
  let seq = 0;
  const nid = (p) => `${p}-${++seq}`;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));

  // Structure-level (schema-ish) checks for in-editor state
  for (const n of nodes) {
    if (!n.data?.name || !String(n.data.name).trim()) {
      issues.push({ id: nid('iss'), severity: 'error', message: 'Component has no name.', nodeIds: [n.id], hint: 'Name it in the inspector.' });
    }
    if (!CATALOG[n.type]) {
      issues.push({ id: nid('iss'), severity: 'error', message: `Unknown component type "${n.type}".`, nodeIds: [n.id] });
    }
  }
  for (const e of edges) {
    if (!byId.has(e.source)) {
      issues.push({ id: nid('iss'), severity: 'error', message: `Connection references a deleted source component.`, edgeIds: [e.id], hint: 'Delete this connection.' });
    }
    if (!byId.has(e.target)) {
      issues.push({ id: nid('iss'), severity: 'error', message: `Connection references a deleted target component.`, edgeIds: [e.id], hint: 'Delete this connection.' });
    }
  }

  // Duplicate names
  const nameCount = new Map();
  for (const n of nodes) {
    const nm = (n.data?.name || '').trim().toLowerCase();
    if (nm) nameCount.set(nm, (nameCount.get(nm) || 0) + 1);
  }
  for (const n of nodes) {
    const nm = (n.data?.name || '').trim().toLowerCase();
    if (nm && nameCount.get(nm) > 1) {
      issues.push({ id: nid('iss'), severity: 'warning', message: `Duplicate component name "${n.data.name}".`, nodeIds: [n.id] });
    }
  }

  // Self-edges
  for (const e of edges) {
    if (e.source === e.target) {
      issues.push({ id: nid('iss'), severity: 'error', message: `Component "${byId.get(e.source)?.data?.name || e.source}" connects to itself.`, nodeIds: [e.source], edgeIds: [e.id] });
    }
  }

  for (const e of edges) {
    if (byId.has(e.source)) outgoing.get(e.source).push(e);
    if (byId.has(e.target)) incoming.get(e.target).push(e);
  }

  // Connectedness: BFS from first node
  if (nodes.length > 1) {
    const adj = new Map(nodes.map((n) => [n.id, []]));
    for (const e of edges) {
      if (byId.has(e.source) && byId.has(e.target)) {
        adj.get(e.source).push(e.target);
        adj.get(e.target).push(e.source);
      }
    }
    const visited = new Set([nodes[0].id]);
    const queue = [nodes[0].id];
    while (queue.length) {
      const cur = queue.shift();
      for (const nx of adj.get(cur)) if (!visited.has(nx)) { visited.add(nx); queue.push(nx); }
    }
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        issues.push({ id: nid('iss'), severity: 'warning', message: `Component "${n.data?.name}" is disconnected from the rest of the architecture.`, nodeIds: [n.id], hint: 'Connect it or remove it.' });
      }
    }
  }

  // Application components with no path to a data store & nothing inbound
  const dataTypes = new Set(Object.entries(CATALOG).filter(([, c]) => c.category === 'Data').map(([t]) => t));
  for (const n of nodes) {
    const cat = CATALOG[n.type]?.category;
    if (incoming.get(n.id).length === 0 && ['Application', 'Data', 'Security'].includes(cat)) {
      issues.push({ id: nid('iss'), severity: 'info', message: `"${n.data?.name}" has no incoming connections.`, nodeIds: [n.id], hint: 'Edge cases come in via a boundary component.' });
    }
    if (cat === 'Application' && outgoing.get(n.id).length === 0) {
      issues.push({ id: nid('iss'), severity: 'warning', message: `Application component "${n.data?.name}" calls nothing (no outgoing connections).`, nodeIds: [n.id], hint: 'Most services persist or emit data.' });
    }
  }

  // Data-store reachability from at least one app node
  const appReachableData = new Set();
  for (const n of nodes) {
    if (CATALOG[n.type]?.category !== 'Application') continue;
    const stack = [n.id];
    const seen = new Set(stack);
    while (stack.length) {
      const cur = stack.pop();
      if (dataTypes.has(byId.get(cur)?.type)) appReachableData.add(n.id);
      for (const e of outgoing.get(cur)) if (!seen.has(e.target)) { seen.add(e.target); stack.push(e.target); }
    }
  }
  const appNodes = nodes.filter((n) => CATALOG[n.type]?.category === 'Application');
  if (appNodes.length > 0 && appNodes.every((n) => !appReachableData.has(n.id))) {
    issues.push({ id: nid('iss'), severity: 'warning', message: 'No application component reaches a data store — check persistence.', hint: 'Add a database and wire it in.' });
  }

  // Suspicious cycles across async + sync edges
  const color = new Map(); // 0 white 1 gray 2 black
  let cycleFound = false;
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) if (byId.has(e.source) && byId.has(e.target)) adj.get(e.source).push(e.target);
  const dfs = (u) => {
    color.set(u, 1);
    for (const v of adj.get(u)) {
      const c = color.get(v) || 0;
      if (c === 1) cycleFound = true;
      else if (c === 0) dfs(v);
    }
    color.set(u, 2);
  };
  for (const n of nodes) if ((color.get(n.id) || 0) === 0) dfs(n.id);
  if (cycleFound) {
    issues.push({ id: nid('iss'), severity: 'warning', message: 'Dependency cycle detected — consider decoupling with a queue.', hint: 'Cycles complicate deploys and failure reasoning.' });
  }

  // Missing tech/description details
  for (const n of nodes) {
    if (CATALOG[n.type] && !n.data?.technology) {
      issues.push({ id: nid('iss'), severity: 'info', message: `"${n.data?.name}" has no technology specified.`, nodeIds: [n.id], hint: 'Set one for accurate codegen.' });
    }
  }

  return { issues, errorCount: issues.filter((i) => i.severity === 'error').length,
           warningCount: issues.filter((i) => i.severity === 'warning').length,
           infoCount: issues.filter((i) => i.severity === 'info').length };
}

module.exports = { validateArchitecture };
