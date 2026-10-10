/**
 * Arch2Code AI — canonical architecture data model.
 * Pure data. No canvas-library runtime objects. schemaVersion "1.0.0".
 *
 * Note: JavaScript here because the environment cannot install TypeScript
 * tooling (disk full). Types are documented via JSDoc; runtime validation
 * replaces transpile-time checks.
 */

/** Component type strings (see catalog.js for icons/categories/defaults). */
const COMPONENT_TYPES = [
  // Application
  'web-app', 'mobile-app', 'frontend', 'backend-service', 'api-gateway', 'serverless-function',
  // Data
  'postgres', 'mysql', 'mongodb', 'redis', 'object-storage', 'data-warehouse',
  // Infrastructure
  'docker-container', 'kubernetes-cluster', 'load-balancer', 'cdn', 'cloud-service',
  // Messaging
  'kafka', 'message-queue', 'event-bus',
  // Security
  'auth-service', 'authz-service', 'secrets-manager',
  // External
  'third-party-api', 'payment-provider', 'email-service',
] ;

/** Edge relationship types. */
const RELATIONSHIP_TYPES = ['sync-call', 'async-event', 'data-read', 'data-write'];

const SCHEMA_VERSION = '1.0.0';

/**
 * @param {string} name
 * @param {string} [tech]
 * @param {string} [desc]
 * @param {Array<{name:string, value:string}>} [envVars]
 */
function makeNode(id, type, name, x, y, extra = {}) {
  return {
    id, type,
    position: { x: Number(x) || 0, y: Number(y) || 0 },
    data: {
      name: String(name || 'Component'),
      technology: String(extra.technology || ''),
      description: String(extra.description || ''),
      environment: String(extra.environment || 'production'),
      port: extra.port != null && isFinite(Number(extra.port)) ? Number(extra.port) : null,
      tags: Array.isArray(extra.tags) ? extra.tags.map(String).slice(0, 10) : [],
      envVarNames: Array.isArray(extra.envVarNames) ? extra.envVarNames.map(String).slice(0, 15) : [],
      endpoints: Array.isArray(extra.endpoints) ? extra.endpoints.map(String).slice(0, 20) : [],
      notes: String(extra.notes || ''),
    },
    meta: { width: 180, height: 64 },
  };
}

/** @param {string} [label] */
function makeEdge(id, source, target, relationship = 'sync-call', label = '') {
  return {
    id, source, target,
    label: String(label || ''),
    relationship: RELATIONSHIP_TYPES.includes(relationship) ? relationship : 'sync-call',
  };
}

/** A complete versioned project archive. */
function makeProject({ id, name, description, nodes, edges, technologies, createdAt, updatedAt }) {
  const now = new Date().toISOString();
  const stamp = createdAt || now;
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: String(id),
      name: String(name || 'Untitled'),
      description: String(description || ''),
      status: 'in-progress',
      createdAt: stamp,
      updatedAt: updatedAt || stamp,
    },
    architecture: {
      nodes: Array.isArray(nodes) ? nodes : [],
      edges: Array.isArray(edges) ? edges : [],
    },
    metadata: { technologies: Array.isArray(technologies) ? technologies : [], version: 1 },
  };
}

module.exports = { COMPONENT_TYPES, RELATIONSHIP_TYPES, SCHEMA_VERSION, makeNode, makeEdge, makeProject };
