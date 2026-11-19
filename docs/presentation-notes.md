# Arch2Code AI — Presentation Notes

**Audience:** engineers, product/tech leads, hackathon judges, or internal stakeholders.
**Suggested length:** 10 min demo + 3–5 min Q&A. Timings below assume that.
**Run state used for these numbers:** `npm start` on http://localhost:8787, 10 projects / 69 components / 70 connections, 42 tests passing.

---

## 1. The one-liner

> **Arch2Code AI turns a system description into an editable architecture diagram, checks it with deterministic rules, and generates a runnable Node.js + TypeScript scaffold — with zero runtime dependencies and no build step.**

Pipeline to repeat on every slide: **Describe → Design → Validate → Generate → Export.**

---

## 2. The problem (30 s)

Architecture design today is split across tools that don't talk to each other:

- **Whiteboards / draw.io / Excalidraw** — great for boxes, but the diagram is a picture. Nothing downstream can read it.
- **Mermaid / PlantUML** — text that renders, but painful to edit spatially and easy to drift from reality.
- **"Just start coding"** — architecture emerges accidentally, and nobody can explain it six months later.

The gap: **the diagram is not a data structure**, so it can't be validated, generated from, or trusted.

Arch2Code AI's bet: make the architecture a **canonical, versioned JSON model** first, then every other feature (canvas, validation, AI, codegen, export) is just a view or consumer of that model.

---

## 3. What the build actually does today (verified)

| Stage | What's implemented |
|---|---|
| **Describe** | Natural-language prompt → server-side Groq call (`openai/gpt-oss-120b`, `json_mode`, temp 0.2, 30 s timeout, fallback model chain) → strict schema validation → **review modal** (rationale, assumptions, risks, techs, counts) → Apply/Discard. Every attempt logged to `data/generations/`. |
| **Design** | SVG canvas editor: 26 component types in 6 categories, drag/drop, connect handles, 4 relationship types, inspector for real graph state, undo/redo (60 snapshots), keyboard shortcuts, minimap, auto-layout, fit, pan/zoom. |
| **Validate** | Deterministic engine: broken edge references, unknown types, unnamed nodes, duplicate names, self-connections, disconnected components, apps with no outgoing calls, no app reaching a data store, dependency cycles, missing technology. Error/warning/info; click an issue → canvas focuses the node. |
| **Generate** | Deterministic Node + TS (Fastify) scaffold from the canonical graph: per-service `package.json`, `tsconfig.json`, `src/index.ts`, `src/routes.ts`, `src/db.ts`, `.env.example` (names only), `Dockerfile`, smoke test, plus root `README.md` and `manifest.json` with an `architectureHash`. Unsupported components become explicit TODOs, never silent omissions. |
| **Export** | Architecture JSON (re-importable), validation report JSON, scaffold ZIP, **Mermaid `.mmd`**. Also **Mermaid import** back into the canvas (replace or merge). |
| **Operate** | Dashboard with live stats/search, project library (rename, duplicate, delete), templates (7 built-ins), generated-code browser with file tree + line numbers, StackBlitz WebContainers live dev sandbox. |

**Verified numbers (use these, not the README's older ones):**
- 42 tests passing, 8 suites (`npm test`) — unit (schema/validation/codegen/ZIP) + full REST lifecycle.
- 26 component types, 6 categories, 4 relationship types.
- 7 built-in templates; seeder adds 4 showcase projects idempotently.
- 0 runtime npm dependencies; Node ≥ 18 (tested on 22.18).
- 10 projects, 69 components, 70 connections in the current local dataset.
- 44 AI generation attempts logged locally.

---

## 4. Demo script (10 min)

> **Prep:** `npm start` → http://localhost:8787. Run `npm run seed` if the library is empty or messy. Tabs to pre-open: `/dashboard`, one seeded project in the editor, `/code/<id>`.

### 0:00 — Landing page (30 s)
- Don't tour it. Read the pipeline pills out loud: **describe, design, validate, generate, export.**
- Cue: "The important part is that these are five views of one data model, not five separate tools."

### 0:30 — Dashboard (45 s)
- Point at live stats: projects, components, in-progress count — all from real files on disk, not fixtures.
- Show the **three creation paths**: upload JSON/Mermaid, draw manually, describe with AI.
- One sentence on templates: "Seven starting points, but they're real graphs, not screenshots."

### 1:15 — Editor (3 min) — *the core*
Open **ShopFlow Commerce** (seeded, 10 nodes / 9 edges).

1. **Canvas:** pan, zoom, drag a node. Say: "SVG, no canvas library, no runtime deps."
2. **Connect:** drag from a node handle to another; select the edge; change relationship type in the inspector (sync-call / async-event / data-read / data-write).
3. **Inspector:** change a name and point out that the graph state — not the pixel label — is the source of truth.
4. **Undo/redo:** `Ctrl+Z` / `Ctrl+Shift+Z`. Mention 60-deep full snapshots.
5. **Validate:** click **Validate**, open the bottom issues panel, read one warning, then **click it** — canvas focuses the offending node. This is the "aha" moment: validation is actionable, not a lint dump.
6. **Auto-layout + Fit**, then **Save** (watch the save-state dot).

Cue: "Validation is structural, not a design review. I'll be honest about that in a minute."

### 4:15 — AI generation (2 min)
Use the editor's **Generate** (or `/projects/new` → Describe with AI).

**Prompt to paste:**
> A real-time collaborative document editor for small teams. Users authenticate, open documents over WebSockets, and edits are persisted with version history. Include a Postgres primary store, Redis presence/pub-sub, object storage for file attachments, and an email service for invites.

- While it runs: "The prompt goes server-side only — the browser never sees the API key. Output is forced JSON, then parsed defensively; invalid nodes/edges are dropped before you ever see them."
- Review modal: read **one assumption** and **one risk** out loud. This is the trust boundary — the human approves.
- **Apply** → nodes appear with auto-layout.
- If provider fails: the API returns a **labeled `demo-fallback`** proposal instead of a 502; the modal says *demo (no model)*. Say: "It degrades honestly instead of pretending."

### 6:15 — Generated code + export (2 min)
- Editor **⌘ Code** or sidebar **Generated Code** → `/code/<id>`.
- Show the file tree, line numbers, per-file copy/download, **Regenerate**.
- Open `services/<service>/src/index.ts`: health route, real dependency comments, env-derived port.
- Open `manifest.json`: **architectureHash** — same graph ⇒ same scaffold. Determinism is the feature.
- **Download ZIP**.
- Optional 20 s: **Open live dev sandbox** → StackBlitz runs `npm run dev`. Say explicitly: "Third-party service; the scaffold leaves this app when you click."
- Back to editor → **Export** → show JSON, validation report, Mermaid `.mmd`. Mention Mermaid **import** on `/projects/new` (replace/merge).

### 8:15 — Proof + honest close (1 min)
- Run `npm test` on screen or show the result: **42 passing, 0 failing.**
- `curl /api/health` — shows provider mode and schema version. "The app tells you what mode it's in."
- Close with the limitation slide (below). Judges and engineers trust the deck more when you name the gaps first.

### 9:15 — Q&A buffer

### Demo failure playbook
| If… | Do this |
|---|---|
| Groq is slow (>10 s) | Keep narrating the pipeline; the request times out at 30 s and falls back. |
| Rate limited (429) | Rate limit is 12 AI requests/IP/5 min. Switch to a seeded project or `DEMO_MODE=1 npm start`. |
| No network / no key | The app boots in labeled demo mode; AI proposals are deterministic and marked *demo (no model)*. |
| Editor state is messy | Use a seeded project; `npm run seed` is idempotent and offline. |
| Zip download blocked | Show `/code` file browser instead; the content is identical. |

---

## 5. How it works (architecture slide)

```
Browser (vanilla ES modules, no build step)
  public/js/app.js        hash-router SPA, SVG canvas, inspector, modals
  public/js/api.js        thin fetch wrapper
        │  JSON over HTTP
        ▼
Node http server (server/js/server.cjs)         zero deps
  • static SPA + security headers
  • REST API, 4 MB body cap, per-IP AI rate limit
  • atomic JSON persistence in data/projects/
  • corrupted files quarantined, never overwritten
        │
        ├── shared/js/schema.cjs     runtime schema validation (untrusted input)
        ├── shared/js/validate.cjs   deterministic rule engine
        ├── shared/js/codegen.cjs    deterministic scaffold generator
        ├── shared/js/zipwriter.cjs  in-house ZIP writer (no dependency)
        ├── shared/js/mermaid.cjs    Mermaid parse + serialize
        └── server/js/ai.cjs         Groq client, strict output parsing, fallback
```

**Canonical model** (`shared/js/types.cjs`):
`{ schemaVersion, project:{id,name,status,timestamps}, architecture:{nodes,edges}, metadata:{technologies,version} }`
Nodes carry position + data (name, technology, description, environment, port, tags, env var **names**, endpoints, notes). Edges carry source/target, label, relationship. **No secrets or values, only names.**

**Persistence:** one atomically-written JSON per project (`write temp → rename`). Corruption is quarantined as `.corrupt-<ts>` rather than overwritten. Soft-delete then unlink.

**REST API:** `GET /api/health`, `GET|POST /api/projects`, `GET|PUT|DELETE /api/projects/:id`, `POST /api/projects/:id/validate`, `POST /api/projects/:id/import/mermaid`, `GET /api/projects/:id/code`, `GET|POST /api/projects/:id/export?format=json|zip|validation-report|mermaid`, `GET /api/generations`, `POST /api/ai/generate`, `GET /api/templates`.

---

## 6. Decisions worth defending

1. **Canonical JSON before canvas.** Diagram pixels are a projection. That's why validate, AI apply, codegen, exports, and re-import all agree.
2. **Zero runtime dependencies.** No install, no supply-chain surface, easy to audit and to demo offline. Cost: hand-written ZIP writer, router, SVG interactions, tests.
3. **Deterministic where it matters.** Validation and codegen are pure functions of the graph. Same architecture ⇒ same scaffold (`architectureHash`). AI is the only stochastic part, and it sits behind a human review gate.
4. **AI output is untrusted input.** Forced JSON mode, then defensive parsing: unknown types dropped, duplicate/self edges dropped, names bounded, max 20 nodes, 4–14 requested. Schema validation runs again server-side before persistence.
5. **Honest degradation.** Provider error → labeled demo proposal (unless `AI_FALLBACK=off`). Unsupported components → explicit TODOs in generated README. No silent omission anywhere.
6. **Server-side keys.** `GROQ_API_KEY` never reaches the browser; prompts are capped at 4,000 chars.
7. **File storage on purpose.** One user, one folder, atomic writes. It makes the demo reproducible; it is not pretending to be a multi-tenant database.

---

## 7. Security & trust posture (one slide if asked)

- CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` on every response.
- Path-traversal-safe static serving and project ids (regex-constrained, normalized prefix check).
- 4 MB request cap; 200 KB Mermaid import cap; 10 MB image reference cap.
- Per-IP rate limit on `POST /api/ai/generate`: 12 requests / 5 min → 429 + `Retry-After`.
- Model output schema-checked and size-bounded before it reaches the client or disk.
- No auth in the product sense — the `/auth` page is a local demo identity. Say that plainly.

---

## 8. Honest limitations (say these before Q&A)

- **Single-user, local file storage.** No database, no accounts, no sharing, no concurrency control.
- **Generated code is scaffolding, not an app.** Routes are TODOs; no business logic, no real ORM wiring, no migrations.
- **Validation is structural, not semantic.** Passing does not mean the design is correct or production-ready.
- **AI proposals are schema-checked, not design-reviewed.** The human review modal is the trust boundary.
- **Image upload is a stored reference.** No diagram recognition.
- **Only one codegen target** (Node + TS + Fastify). Other stacks aren't supported yet.
- **Groq-specific AI client.** No provider abstraction in the UI/settings yet.
- **Deliberately build-step-free client** — `app.js` is one large file; the server tests cover the logic it calls, but the UI has no unit tests.
- **No local IDE integration.** The app never writes scaffolds to your disk or launches an editor; use ZIP or StackBlitz.
- **No Mermaid round-trip guarantee** — import infers types and layout; complex hand-written Mermaid will not survive perfectly.

---

## 9. Q&A prep

**"How is this different from draw.io/Excalidraw/Mermaid?"**
Those end at the picture or the text. Here the diagram *is* the model, so the same artifact powers validation, AI application, scaffold generation, and re-import. Export to Mermaid is a format, not the source of truth.

**"Does it actually build a working app?"**
It builds a working *skeleton*: each service compiles, serves `/health`, and carries dependency comments, a Dockerfile, env template, and smoke test. Business logic is explicitly TODO. The StackBlitz sandbox proves `npm run dev` runs.

**"How do you stop hallucinated architecture?"**
You don't fully — you contain it. Constrained component vocabulary, JSON mode, node/edge limits, defensive parsing, schema re-validation, and a mandatory human review before apply. Demo/fallback output is labeled as such.

**"What happens without an API key?"**
The app still runs; AI is labeled demo mode and the offline generator produces deterministic proposals. Everything else is unaffected.

**"Why no TypeScript/React/build step?"**
Deliberate: zero-install, zero-dependency, fully auditable, and the demo works offline. The tradeoff is a large client file and manual DOM work.

**"Can I plug in OpenAI/Anthropic/local models?"**
Not through configuration today — the client is Groq-shaped. Groq's API is OpenAI-compatible, so a provider abstraction is a small, obvious next step.

**"How would this become a product?"**
Shared persistence, real auth/workspaces, hosted deployment, more generators (compose/K8s/Terraform), provider choice, and collaboration. The model and validators are already the durable core.

**"What's the cost?"**
Zero infra dependencies; AI spend is per-request Groq tokens, capped by a 4,000-char prompt, 3,000 max output tokens, and per-IP rate limiting.

**"What was hardest?"**
Keeping one model authoritative across five consumers — canvas, validation, AI import, codegen, export/import — without drift. The schema and deterministic engines are what make that tractable.

---

## 10. Roadmap (pick 3, don't list all)

1. **Provider abstraction + settings** (OpenAI-compatible, local models, per-workspace keys).
2. **Real persistence and sharing** (hosted DB, accounts, share links, version history).
3. **More generators** (docker-compose, Kubernetes manifests, Terraform, OpenAPI stubs).
4. **Deeper validation** (latency/cost budgets, security boundaries, PII flow, SPOF detection).
5. **Bidirectional Mermaid fidelity** and diagram-image understanding.
6. **Template gallery** driven by real reference architectures.

---

## 11. Closing line

> "Most architecture tools stop at the drawing. This one starts there: the diagram is a validated data structure that can generate code, survive review, and come back in. It's small, dependency-free, and honest about what it doesn't do yet — which is exactly what you want from the first version of a design tool."

---

## Appendix — run & verify commands

```bash
npm start                 # http://localhost:8787, no install needed
npm run seed              # 4 idempotent showcase projects, offline
npm test                  # 42 tests, 8 suites (unit + REST lifecycle)
curl localhost:8787/api/health
```

Demo prompt (short):
> A SaaS billing platform: React dashboard, API gateway, subscription service, webhook worker, Postgres, Redis, Kafka for usage events, Stripe for payments, and an email service for invoices.
