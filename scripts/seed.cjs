#!/usr/bin/env node
/**
 * Seeds deterministic showcase projects so a fresh clone has something to demo.
 * Idempotent: projects whose name already exists are skipped. Runs offline.
 *
 *   npm run seed
 */
const fs = require('fs');
const path = require('path');

const { makeProject, SCHEMA_VERSION } = require('../shared/js/types.cjs');
const { instantiateTemplate, uid } = require('../shared/js/templates.cjs');
const { validateProject } = require('../shared/js/schema.cjs');
const { generateDemoProposal } = require('../server/js/ai.cjs');

const DATA_DIR = process.env.ARCH2CODE_DATA_DIR
  ? path.resolve(process.env.ARCH2CODE_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

const SHOWCASE = [
  {
    kind: 'template',
    template: 'e-commerce',
    name: 'ShopFlow Commerce',
    description: 'Storefront, checkout and order fulfilment on a modular commerce stack (template).',
  },
  {
    kind: 'template',
    template: 'microservices',
    name: 'Atlas Microservices Platform',
    description: 'Containerised services behind a gateway with shared identity and messaging (template).',
  },
  {
    kind: 'template',
    template: 'event-driven',
    name: 'Pulse Event Pipeline',
    description: 'Event-driven backend: producers, a broker and consumers with its own data store (template).',
  },
  {
    kind: 'demo-ai',
    name: 'Campus Event Platform',
    prompt:
      'Campus event booking platform with a React web app, Node.js backend, user authentication, PostgreSQL storage, Redis caching and Kafka-based notifications.',
    description: 'Generated offline from a natural-language description (deterministic demo generator).',
  },
];

function existingNames() {
  if (!fs.existsSync(PROJECTS_DIR)) return new Set();
  const names = new Set();
  for (const f of fs.readdirSync(PROJECTS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8'));
      if (parsed?.project?.name) names.add(parsed.project.name);
    } catch { /* unreadable files are ignored, the server quarantines them */ }
  }
  return names;
}

function archiveFromProposal(proposal, { name, description }) {
  return makeProject({
    id: uid('proj'),
    name,
    description,
    nodes: proposal.nodes,
    edges: proposal.edges,
    technologies: proposal.technologies,
  });
}

function build(entry) {
  if (entry.kind === 'template') {
    if (!instantiateTemplate) throw new Error('templates module unavailable');
    const inst = instantiateTemplate(entry.template, { name: entry.name, description: entry.description });
    if (!inst) throw new Error(`unknown template "${entry.template}"`);
    return inst.project;
  }
  const demo = generateDemoProposal({ prompt: entry.prompt });
  return archiveFromProposal(demo.proposal, entry);
}

function write(archive) {
  const v = validateProject(archive);
  if (!v.ok) throw new Error(`invalid project "${archive.project.name}": ${JSON.stringify(v.errors)}`);
  const target = path.join(PROJECTS_DIR, `${v.project.project.id}.json`);
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(v.project, null, 2));
  fs.renameSync(tmp, target);
  return v.project;
}

fs.mkdirSync(PROJECTS_DIR, { recursive: true });
const names = existingNames();
let created = 0;
let skipped = 0;

for (const entry of SHOWCASE) {
  if (names.has(entry.name)) {
    console.log(`· skip   ${entry.name} (already present)`);
    skipped++;
    continue;
  }
  try {
    const project = write(build(entry));
    console.log(
      `✓ create ${project.project.name} — ${project.architecture.nodes.length} components, ` +
      `${project.architecture.edges.length} connections [${project.project.id}]`
    );
    created++;
  } catch (e) {
    console.error(`✗ failed ${entry.name}: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log(`\nSeed complete: ${created} created, ${skipped} skipped. Schema ${SCHEMA_VERSION}.`);
if (created === 0) console.log('Nothing to do — run `npm start` (or delete data/projects/*.json for a clean slate).');
