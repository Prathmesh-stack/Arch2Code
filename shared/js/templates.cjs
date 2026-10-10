const { makeNode, makeEdge, makeProject } = require('./types.cjs');

let uidCounter = 0;
function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

/**
 * Templates build REAL nodes/edges in the canonical model.
 * Each factory returns a partial project (no id).
 */
const TEMPLATES = {
  'basic-rest-api': {
    name: 'Basic REST API',
    description: 'A minimal REST API backed by PostgreSQL and Redis cache.',
    build: () => {
      const nodes = [
        makeNode('n-client', 'web-app', 'Web Client', 60, 140, { technology: 'React' }),
        makeNode('n-gw', 'api-gateway', 'API Gateway', 320, 140, { technology: 'Nginx', port: 8080 }),
        makeNode('n-api', 'backend-service', 'API Service', 580, 140, { technology: 'Express', port: 3000 }),
        makeNode('n-db', 'postgres', 'Primary DB', 840, 100, { technology: 'PostgreSQL 16', port: 5432 }),
        makeNode('n-redis', 'redis', 'Cache', 840, 240, { technology: 'Redis 7', port: 6379 }),
      ];
      const edges = [
        makeEdge('e-1', 'n-client', 'n-gw', 'sync-call', 'HTTPS'),
        makeEdge('e-2', 'n-gw', 'n-api', 'sync-call', 'proxy'),
        makeEdge('e-3', 'n-api', 'n-db', 'data-write', 'sql'),
        makeEdge('e-4', 'n-api', 'n-redis', 'data-read', 'get/set'),
      ];
      return { name: 'Basic REST API', nodes, edges, technologies: ['Node.js', 'React', 'PostgreSQL', 'Redis'] };
    },
  },
  'three-tier-web': {
    name: 'Three-Tier Web Application',
    description: 'Classic presentation / application / data tiers behind an LB and CDN.',
    build: () => {
      const nodes = [
        makeNode('n-cdn', 'cdn', 'CDN', 40, 100, { technology: 'CloudFront' }),
        makeNode('n-front', 'frontend', 'Frontend', 260, 100, { technology: 'React' }),
        makeNode('n-lb', 'load-balancer', 'Load Balancer', 480, 100, { technology: 'HAProxy' }),
        makeNode('n-app1', 'backend-service', 'App Server 1', 700, 40, { technology: 'Node.js', port: 3000 }),
        makeNode('n-app2', 'backend-service', 'App Server 2', 700, 180, { technology: 'Node.js', port: 3001 }),
        makeNode('n-db', 'postgres', 'Primary DB', 940, 110, { technology: 'PostgreSQL 16', port: 5432 }),
      ];
      const edges = [
        makeEdge('e-1', 'n-cdn', 'n-front', 'sync-call'),
        makeEdge('e-2', 'n-front', 'n-lb', 'sync-call', 'HTTPS'),
        makeEdge('e-3', 'n-lb', 'n-app1', 'sync-call'),
        makeEdge('e-4', 'n-lb', 'n-app2', 'sync-call'),
        makeEdge('e-5', 'n-app1', 'n-db', 'data-write'),
        makeEdge('e-6', 'n-app2', 'n-db', 'data-write'),
      ];
      return { name: 'Three-Tier Web Application', nodes, edges, technologies: ['React', 'Node.js', 'PostgreSQL'] };
    },
  },
  'e-commerce': {
    name: 'E-Commerce Platform',
    description: 'Storefront, order/checkout services, Kafka events, payments and a data warehouse.',
    build: () => {
      const nodes = [
        makeNode('n-client', 'web-app', 'Storefront', 40, 160, { technology: 'Next.js' }),
        makeNode('n-gw', 'api-gateway', 'API Gateway', 280, 160, { port: 8080 }),
        makeNode('n-catalog', 'backend-service', 'Catalog Service', 540, 40, { technology: 'NestJS' }),
        makeNode('n-order', 'backend-service', 'Order Service', 540, 180, { technology: 'NestJS' }),
        makeNode('n-pay', 'payment-provider', 'Payment Provider', 540, 320, { technology: 'Stripe' }),
        makeNode('n-kafka', 'kafka', 'Kafka', 800, 180, { technology: 'Kafka 3' }),
        makeNode('n-worker', 'backend-service', 'Notification Worker', 1040, 260, { technology: 'Node.js' }),
        makeNode('n-pg', 'postgres', 'Orders DB', 800, 40, { technology: 'PostgreSQL 16' }),
        makeNode('n-redis', 'redis', 'Session Cache', 280, 20, { technology: 'Redis 7' }),
        makeNode('n-dw', 'data-warehouse', 'Analytics DW', 1040, 100, { technology: 'Snowflake' }),
      ];
      const edges = [
        makeEdge('e-1', 'n-client', 'n-gw', 'sync-call', 'HTTPS'),
        makeEdge('e-2', 'n-gw', 'n-catalog', 'sync-call'),
        makeEdge('e-3', 'n-gw', 'n-order', 'sync-call'),
        makeEdge('e-4', 'n-client', 'n-redis', 'data-read', 'sessions'),
        makeEdge('e-5', 'n-order', 'n-pay', 'sync-call', 'charge'),
        makeEdge('e-6', 'n-order', 'n-pg', 'data-write'),
        makeEdge('e-7', 'n-order', 'n-kafka', 'async-event', 'order.created'),
        makeEdge('e-8', 'n-kafka', 'n-worker', 'async-event'),
        makeEdge('e-9', 'n-kafka', 'n-dw', 'async-event', 'cdc'),
      ];
      return { name: 'E-Commerce Platform', nodes, edges, technologies: ['Next.js', 'NestJS', 'PostgreSQL', 'Kafka', 'Redis'] };
    },
  },
  'auth-service': {
    name: 'Authentication Service',
    description: 'Identity provider with secrets manager and email verification.',
    build: () => {
      const nodes = [
        makeNode('n-client', 'web-app', 'Client App', 40, 140),
        makeNode('n-auth', 'auth-service', 'Auth Service', 300, 140, { technology: 'Keycloak', port: 8090 }),
        makeNode('n-db', 'postgres', 'Identity DB', 560, 80, { technology: 'PostgreSQL 16' }),
        makeNode('n-secrets', 'secrets-manager', 'Secrets Manager', 560, 220, { technology: 'Vault' }),
        makeNode('n-mail', 'email-service', 'Email Service', 820, 140, { technology: 'Resend' }),
      ];
      const edges = [
        makeEdge('e-1', 'n-client', 'n-auth', 'sync-call', 'OIDC'),
        makeEdge('e-2', 'n-auth', 'n-db', 'data-write'),
        makeEdge('e-3', 'n-auth', 'n-secrets', 'data-read', 'keys'),
        makeEdge('e-4', 'n-auth', 'n-mail', 'sync-call', 'verification mail'),
      ];
      return { name: 'Authentication Service', nodes, edges, technologies: ['React', 'Keycloak', 'PostgreSQL', 'Vault'] };
    },
  },
  'event-driven': {
    name: 'Event-Driven Architecture',
    description: 'Producers and consumers communicating through a durable event bus.',
    build: () => {
      const nodes = [
        makeNode('n-web', 'web-app', 'Web App', 40, 140),
        makeNode('n-api', 'backend-service', 'Command API', 300, 140, { port: 3000 }),
        makeNode('n-bus', 'event-bus', 'Event Bus', 560, 140, { technology: 'NATS' }),
        makeNode('n-inv', 'backend-service', 'Inventory Worker', 820, 40),
        makeNode('n-notif', 'backend-service', 'Notification Worker', 820, 240),
        makeNode('n-mongo', 'mongodb', 'Read Model DB', 1060, 140, { technology: 'MongoDB 7' }),
      ];
      const edges = [
        makeEdge('e-1', 'n-web', 'n-api', 'sync-call'),
        makeEdge('e-2', 'n-api', 'n-bus', 'async-event', 'commands'),
        makeEdge('e-3', 'n-bus', 'n-inv', 'async-event'),
        makeEdge('e-4', 'n-bus', 'n-notif', 'async-event'),
        makeEdge('e-5', 'n-inv', 'n-mongo', 'data-write'),
        makeEdge('e-6', 'n-notif', 'n-mongo', 'data-write'),
      ];
      return { name: 'Event-Driven Architecture', nodes, edges, technologies: ['React', 'Node.js', 'NATS', 'MongoDB'] };
    },
  },
  'microservices': {
    name: 'Microservices Platform',
    description: 'Kubernetes-hosted microservices with gateway, auth and messaging.',
    build: () => {
      const nodes = [
        makeNode('n-web', 'web-app', 'Web App', 40, 160),
        makeNode('n-gw', 'api-gateway', 'API Gateway', 280, 160, { port: 8080 }),
        makeNode('n-auth', 'auth-service', 'Auth Service', 540, 40, { technology: 'Keycloak' }),
        makeNode('n-users', 'backend-service', 'Users Service', 540, 160, { technology: 'Go' }),
        makeNode('n-orders', 'backend-service', 'Orders Service', 540, 280, { technology: 'Go' }),
        makeNode('n-mq', 'kafka', 'Kafka', 800, 220),
        makeNode('n-pgusers', 'postgres', 'Users DB', 800, 40),
        makeNode('n-pgorders', 'postgres', 'Orders DB', 800, 340),
        makeNode('n-k8s', 'kubernetes-cluster', 'K8s Cluster', 300, 320, { technology: 'EKS' }),
      ];
      const edges = [
        makeEdge('e-1', 'n-web', 'n-gw', 'sync-call'),
        makeEdge('e-2', 'n-gw', 'n-auth', 'sync-call'),
        makeEdge('e-3', 'n-gw', 'n-users', 'sync-call'),
        makeEdge('e-4', 'n-gw', 'n-orders', 'sync-call'),
        makeEdge('e-5', 'n-users', 'n-pgusers', 'data-write'),
        makeEdge('e-6', 'n-orders', 'n-pgorders', 'data-write'),
        makeEdge('e-7', 'n-orders', 'n-mq', 'async-event'),
        makeEdge('e-8', 'n-users', 'n-auth', 'data-read', 'jwt verify'),
        makeEdge('e-9', 'n-users', 'n-k8s', 'data-write', 'deployed on'),
        makeEdge('e-10', 'n-orders', 'n-k8s', 'data-write', 'deployed on'),
      ];
      return { name: 'Microservices Platform', nodes, edges, technologies: ['Go', 'Keycloak', 'PostgreSQL', 'Kafka'] };
    },
  },
  'ai-inference': {
    name: 'AI Inference Service',
    description: 'LLM inference fronted by an API with vector store and cache.',
    build: () => {
      const nodes = [
        makeNode('n-client', 'web-app', 'Client', 40, 140),
        makeNode('n-api', 'backend-service', 'Inference API', 300, 140, { technology: 'FastAPI', port: 8000 }),
        makeNode('n-redis', 'redis', 'Cache', 300, 20),
        makeNode('n-llm', 'third-party-api', 'LLM Provider', 560, 140, { technology: 'Groq' }),
        makeNode('n-vector', 'mongodb', 'Vector Store', 560, 260, { technology: 'Atlas Vector' }),
      ];
      const edges = [
        makeEdge('e-1', 'n-client', 'n-api', 'sync-call'),
        makeEdge('e-2', 'n-api', 'n-redis', 'data-read'),
        makeEdge('e-3', 'n-api', 'n-llm', 'sync-call', 'completions'),
        makeEdge('e-4', 'n-api', 'n-vector', 'data-read', 'embeddings'),
      ];
      return { name: 'AI Inference Service', nodes, edges, technologies: ['FastAPI', 'Groq', 'Redis', 'MongoDB'] };
    },
  },
};

/** Instantiate a template into a full project archive. */
function instantiateTemplate(key, { projectId, name, description }) {
  const t = TEMPLATES[key];
  if (!t) return null;
  const built = t.build();
  const now = new Date().toISOString();
  const project = makeProject({
    id: projectId || uid('proj'),
    name: name || t.name,
    description: description || t.description,
    nodes: built.nodes,
    edges: built.edges,
    technologies: built.technologies,
  });
  project.project.status = 'draft';
  return { project, templateName: t.name };
}

module.exports = { TEMPLATES, instantiateTemplate, uid };
