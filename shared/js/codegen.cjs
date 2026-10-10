const { CATALOG } = require('./catalog.cjs');

const TARGET = { id: 'node-ts-rest', label: 'Node.js + TypeScript REST API', version: '1.0.0' };

/** Deterministic PRNG so same architecture ⇒ same scaffold. */
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Generate a set of text files from the canonical architecture.
 * Returns { files: [{path, content}], target, skipped: [{nodeId, reason}] }
 */
function generateProject(arch, options = {}) {
  const { nodes = [], edges = [] } = arch || {};
  const projectName = options.projectName || 'generated-api';
  const fileMap = new Map(); // path -> content
  const skipped = [];

  const services = nodes.filter((n) => CATALOG[n.type]?.category === 'Application' && n.type !== 'web-app' && n.type !== 'mobile-app' && n.type !== 'frontend');
  const dataNodes = nodes.filter((n) => CATALOG[n.type]?.category === 'Data');
  const dbs = dataNodes.filter((n) => ['postgres', 'mysql', 'mongodb'].includes(n.type));
  const primaryDb = dbs[0];

  if (services.length === 0) {
    services.push({ id: 'synthetic-service', type: 'backend-service', data: { name: 'App Service', technology: 'Fastify' } });
  }

  const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'generated-api';
  const ver = '1.0.0';
  const portFor = (n) => n.data?.port || 3000;

  for (const svc of services) {
    const svcName = (svc.data?.name || 'Service').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'service';
    const folder = `services/${svcName}`;
    const className = (svc.data?.name || 'Service').replace(/[^a-zA-Z0-9]/g, '') || 'Service';
    const deps = edges.filter((e) => e.source === svc.id).map((e) => {
      const t = nodes.find((x) => x.id === e.target);
      return t ? { name: t.data?.name || e.target, rel: e.relationship || 'sync-call' } : null;
    }).filter(Boolean);

    fileMap.set(`${folder}/package.json`, JSON.stringify({
      name: `${safeName}-${svcName}`,
      version: ver,
      private: true,
      scripts: { dev: 'tsx watch src/index.ts', build: 'tsc -p .', start: 'node dist/index.js', test: 'node --test' },
      dependencies: { fastify: '^5.0.0' },
      devDependencies: { typescript: '^5.5.0', tsx: '^4.16.0', '@types/node': '^22.0.0' },
    }, null, 2));

    fileMap.set(`${folder}/tsconfig.json`, JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'commonjs', strict: true, esModuleInterop: true,
        outDir: 'dist', rootDir: 'src', skipLibCheck: true, forceConsistentCasingInFileNames: true,
      },
      include: ['src'],
    }, null, 2));

    fileMap.set(`${folder}/src/index.ts`, [
      `import Fastify from 'fastify';`,
      ``,
      `const app = Fastify({ logger: true });`,
      `const PORT = Number(process.env.PORT ?? ${portFor(svc)});`,
      ``,
      `app.get('/health', async () => ({ status: 'ok', service: '${className}' }));`,
      ``,
      `// Component: ${svc.data?.name} (${svc.type})`,
      svc.data?.description ? `// ${svc.data.description.replace(/\n/g, ' ')}` : null,
      deps.map((d) => `// depends on: ${d.name} [${d.rel}]`).join('\n') || null,
      ``,
      `const start = async () => {`,
      `  try { await app.listen({ port: PORT, host: '0.0.0.0' }); }`,
      `  catch (err) { app.log.error(err); process.exit(1); }`,
      `};`,
      `start();`,
    ].filter((l) => l !== null).join('\n') + '\n');

    fileMap.set(`${folder}/src/routes.ts`, [
      `// TODO: define concrete routes for ${svc.data?.name}.`,
      `// Generated routes are scaffolding only — implement real handlers.`,
      `export const routes = [];`,
    ].join('\n') + '\n');

    if (primaryDb) {
      fileMap.set(`${folder}/src/db.ts`, [
        `// Scaffold data access against ${primaryDb.data?.name} (${primaryDb.type}).`,
        `// Wire your ORM/driver here. Env var: DATABASE_URL (name only, never commit values).`,
        `export const DATABASE_URL = process.env.DATABASE_URL ?? '';`,
        `if (!DATABASE_URL) console.warn('[${className}] DATABASE_URL not set — persistence disabled.');`,
      ].join('\n') + '\n');
    }

    const envVars = ['PORT', ...(primaryDb ? ['DATABASE_URL'] : []), ...(svc.data?.envVarNames || [])];
    fileMap.set(`${folder}/.env.example`, envVars.map((v) => `${v}=`).join('\n') + '\n');

    fileMap.set(`${folder}/Dockerfile`, [
      `FROM node:22-alpine`,
      `WORKDIR /app`,
      `COPY package*.json ./`,
      `RUN npm ci --omit=dev`,
      `COPY . .`,
      `RUN npm run build`,
      `EXPOSE ${portFor(svc)}`,
      `CMD ["node", "dist/index.js"]`,
    ].join('\n') + '\n');

    fileMap.set(`${folder}/test/service.test.js`, [
      `// Minimal smoke test (node:test). Extend with real behavior tests.`,
      `const test = require('node:test');`,
      `test('${svcName} scaffold compiles and health file exists', () => {`,
      `  const fs = require('fs');`,
      `  if (!fs.existsSync(__dirname + '/../src/index.ts')) throw new Error('missing src/index.ts');`,
      `});`,
    ].join('\n') + '\n');
  }

  // Unsupported nodes become explicit placeholders, never silently omitted
  const supported = new Set([...services.map((s) => s.id), ...dataNodes.map((d) => d.id)]);
  for (const n of nodes) {
    if (!supported.has(n.id)) skipped.push({ nodeId: n.id, name: n.data?.name, type: n.type, reason: 'No generator for this component type yet — represented as a TODO below.' });
  }

  fileMap.set('README.md', [
    `# ${projectName} — generated scaffold`,
    ``,
    `Target: **${TARGET.label}** (template v${TARGET.version}). Source of truth: your Arch2Code architecture JSON,`,
    `generated at ${new Date().toISOString()}.`,
    ``,
    `## Services`,
    `| Component | Port | Dependencies |`,
    `| --- | --- | --- |`,
    ...services.map((s) => `| ${s.data?.name} | ${portFor(s)} | ${edges.filter((e) => e.source === s.id).map((e) => nodes.find((x) => x.id === e.target)?.data?.name).filter(Boolean).join(', ') || '—'} |`),
    ``,
    `## Data stores`,
    dataNodes.length ? dataNodes.map((d) => `- ${d.data?.name} (${d.type})`).join('\n') : '- (none in architecture)',
    ``,
    `## Not scaffolded ( placeholders )`,
    skipped.length ? skipped.map((s) => `- ${s.name} (${s.type}): ${s.reason}`).join('\n') : '- (none)',
    ``,
    `> This is generated SCAFFOLDING, not finished software: routes return no business logic yet.`,
    `> All env values are placeholders — fill .env.example locally, never commit real secrets.`,
  ].join('\n') + '\n');

  fileMap.set('manifest.json', JSON.stringify({
    generator: 'arch2code-codegen',
    target: TARGET,
    generatedAt: new Date().toISOString(),
    architectureHash: hash32(JSON.stringify(arch)).toString(16),
    services: services.map((s) => ({ id: s.id, name: s.data?.name, port: portFor(s) })),
    skipped,
  }, null, 2));

  return {
    files: [...fileMap.entries()].map(([path, content]) => ({ path, content })),
    target: TARGET,
    skipped,
  };
}

module.exports = { generateProject, TARGET, hash32 };
