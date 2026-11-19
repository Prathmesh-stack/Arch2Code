/* ============================================================
   Arch2Code AI — SPA bundle (no build step; ES modules, vanilla)
   Sections: utils/router → components → pages → editor → boot
   ============================================================ */

/* ---------- 0. utilities ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const timeAgo = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
};

let toastTimer = null;
function toast(msg, kind = 'ok') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3500);
}

/* ---------- router ---------- */
const routes = [];
function route(pattern, handler) { routes.push({ pattern, handler }); }
function navigate(path) { location.hash = '#' + path; }
function currentPath() { return location.hash.replace(/^#/, '') || '/'; }
function matchRoute(path) {
  for (const r of routes) {
    const keys = [];
    const rx = new RegExp('^' + r.pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([a-zA-Z0-9_-]+)'; }) + '/?$');
    const m = path.match(rx);
    if (m) {
      const params = {};
      keys.forEach((k, i) => (params[k] = m[i + 1]));
      return { handler: r.handler, params };
    }
  }
  return null;
}
// Support deep links & refresh: /docs, /editor/<id> etc. are all served index.html.
if (/^https?:/.test(location.protocol) && location.pathname !== '/' && !location.hash) {
  location.hash = location.pathname + location.search;
}
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

function render() {
  const raw = currentPath();
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  const query = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '');
  const match = matchRoute(path);
  const app = $('#app');
  if (!match) { app.innerHTML = notFoundHTML(raw); bindNotFound(); return; }
  try { match.handler(app, match.params, query); }
  catch (e) { console.error(e); app.innerHTML = errorHTML(e); }
}

function notFoundHTML(path) {
  return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px">
    <div class="eyebrow">404</div>
    <h1>Page not found</h1>
    <p class="muted">No route matches <code class="mono">${esc(path)}</code></p>
    <a href="#/" class="btn primary">Back to home</a></div>`;
}
function bindNotFound() {}
function errorHTML(e) {
  return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px">
    <div class="eyebrow">ERROR</div><h1>Something broke</h1>
    <p class="muted">${esc(e.message || e)}</p><a href="#/" class="btn">Back home</a></div>`;
}
function emptyState(icon, title, sub, actionHTML = '') {
  return `<div class="empty"><div style="font-size:28px">${icon}</div>
    <h2 style="margin:10px 0 4px">${esc(title)}</h2>
    <p class="muted" style="font-size:13px">${esc(sub)}</p>
    <div style="margin-top:14px">${actionHTML}</div></div>`;
}
async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

/* ---------- shared layout (sidebar) ---------- */
const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/projects', label: 'My Projects', icon: '▤' },
  { href: '/code', label: 'Generated Code', icon: '⌘' },
  { href: '/templates', label: 'Templates', icon: '⛨' },
  { href: '/generations', label: 'AI Generations', icon: '✦' },
  { href: '/docs', label: 'Documentation', icon: '❒' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];
function shell(active, breadcrumb, contentHTML) {
  return `<div class="shell">
    <aside class="sidebar">
      <a class="logo" href="#/dashboard" style="text-decoration:none;color:inherit">
        <div class="logo-mark">A2</div>
        <div class="logo-name">Arch2Code AI<small>v1.0.0 · local</small></div>
      </a>
      <div class="nav-label">Workspace</div>
      ${NAV.map((n) => `<a class="nav-item${active === n.href || active.startsWith(n.href + '/') ? ' active' : ''}" href="#${n.href}"><span>${n.icon}</span><span class="txt">${n.label}</span></a>`).join('')}
      <div class="sidebar-foot">local-first · single user<br>schema 1.0.0</div>
    </aside>
    <main class="main">
      <div class="topbar"><div class="breadcrumb">${breadcrumb}</div><div class="spacer"></div>${contentTopActions()}</div>
      ${contentHTML}
    </main>
  </div>`;
}
function contentTopActions() {
  return `<a class="btn primary" href="#/projects/new">＋ New Project</a>`;
}
function layoutPage(active, breadcrumb, html) {
  const app = $('#app');
  app.innerHTML = shell(active, breadcrumb, html);
}

/* ---------- 1. landing & auth pages ---------- */
function landingPage(app) {
  app.innerHTML = `<div>
    <nav style="display:flex;align-items:center;gap:16px;padding:18px 32px;border-bottom:1px solid var(--border)">
      <div class="logo" style="padding:0"><div class="logo-mark">A2</div><div class="logo-name">Arch2Code AI</div></div>
      <div class="spacer" style="flex:1"></div>
      <a href="#/docs" class="btn ghost small">Docs</a>
      <a href="#/auth" class="btn primary small">Open Workspace</a>
    </nav>
    <section class="auth-left" style="min-height:70vh;border-right:none">
      <div class="a-grid"></div><div class="a-glow"></div>
      <div style="position:relative;max-width:640px">
        <div class="eyebrow">YOUR NEW BUILD SURFACE</div>
        <h1 style="font-size:42px;line-height:1.15;margin:14px 0">Make the diagram<br>do more work.</h1>
        <p class="muted" style="font-size:16px">Move from system thinking to a running foundation without losing the thread.</p>
        <div style="display:flex;gap:10px;margin-top:26px">
          <a href="#/auth" class="btn primary">Start building →</a>
          <a href="#/docs" class="btn">Read the docs</a>
        </div>
      </div>
    </section>
    <section style="padding:48px 32px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:1100px;margin:0 auto">
      ${[['✏️', 'Design visually', 'Editable component graph — not a picture. Every node and edge is structured data.'],
         ['✅', 'Validate as you go', 'Deterministic checks catch broken references, cycles and disconnected pieces before they hurt.'],
         ['⚙️', 'Generate a foundation', 'Turn the architecture into a Node.js + TypeScript scaffold you can download and build on.']]
        .map(([i, t, d]) => `<div class="card hover"><div style="font-size:22px">${i}</div><h3 style="margin:10px 0 6px;font-size:14px">${t}</h3><p class="muted" style="font-size:12px">${d}</p></div>`).join('')}
    </section>
    <footer class="muted" style="padding:20px 32px;border-top:1px solid var(--border);font-size:12px">
      Arch2Code AI — describe → design → validate → generate → export.
    </footer>
  </div>`;
}

function authPage(app) {
  let isSignUp = false;
  const draw = () => {
    app.innerHTML = `<div class="auth">
      <section class="auth-left"><div class="a-grid"></div><div class="a-glow"></div>
        <div style="position:relative">
          <div class="eyebrow">YOUR NEW BUILD SURFACE</div>
          <h1 style="font-size:34px;margin:12px 0 10px">Make the diagram do more work.</h1>
          <p class="muted">Move from system thinking to a running foundation without losing the thread.</p>
          <div style="margin-top:24px;display:flex;gap:8px;flex-wrap:wrap">
            <span class="pill">describe</span><span class="pill">design</span><span class="pill">validate</span><span class="pill">generate</span><span class="pill">export</span>
          </div>
        </div>
        <a href="#/" style="position:relative;margin-top:28px;font-size:12px" class="muted">← Back to home</a>
      </section>
      <section class="auth-right"><div class="auth-card">
        <h2 style="margin-bottom:4px">${isSignUp ? 'Create account' : 'Welcome back'}</h2>
        <p class="muted" style="font-size:13px;margin-bottom:16px">${isSignUp ? 'Set up your local workspace identity.' : 'Sign in to your workspace.'}</p>
        <div class="tabs">
          <button id="tab-in" class="${!isSignUp ? 'active' : ''}">Sign in</button>
          <button id="tab-up" class="${isSignUp ? 'active' : ''}">Create account</button>
        </div>
        <form class="form" id="auth-form">
          <div class="field"><label>Email</label><input type="email" name="email" placeholder="dev@arch2code.local" required autocomplete="username"></div>
          <div class="field"><label>Password</label>
            <div style="position:relative">
              <input type="password" name="password" placeholder="••••••••" required minlength="8" autocomplete="current-password">
              <button type="button" id="pw-toggle" style="position:absolute;right:8px;top:7px;color:var(--text2)" title="Show/hide password">👁</button>
            </div>
          </div>
          <div id="auth-msg"></div>
          <button class="btn primary" type="submit" style="justify-content:center">${isSignUp ? 'Create account' : 'Sign in'}</button>
          <button type="button" class="btn ghost small" id="forgot">Forgot password?</button>
        </form>
        <p class="muted" style="font-size:11px;margin-top:14px">
          ⚠️ Auth is <b>demo-only</b> in this local-first milestone — no credentials are sent anywhere or verified against a server.
          Your workspace, projects and data are stored locally on this machine regardless of what you enter here.
        </p>
        <a href="#/dashboard" class="btn" style="margin-top:10px;justify-content:center">Skip → enter local workspace</a>
      </div></section>
    </div>`;
    $('#tab-in').onclick = () => { isSignUp = false; draw(); };
    $('#tab-up').onclick = () => { isSignUp = true; draw(); };
    $('#pw-toggle').onclick = () => {
      const inp = $('[name=password]');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    };
    $('#forgot').onclick = () => { $('#auth-msg').innerHTML = `<div class="form-ok">Password reset is not wired to a mail server in this local milestone. Any email + 8-char password opens the local workspace.</div>`; };
    $('#auth-form').onsubmit = (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim();
      const pw = e.target.password.value;
      const msg = $('#auth-msg');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.innerHTML = '<div class="form-error">Enter a valid email address.</div>'; return; }
      if (pw.length < 8) { msg.innerHTML = '<div class="form-error">Password must be at least 8 characters.</div>'; return; }
      localStorage.setItem('a2c.user', JSON.stringify({ email }));
      navigate('/dashboard');
      toast(`Workspace ready — signed in as ${email} (local demo identity)`);
    };
  };
  draw();
}

/* ---------- 2. dashboard ---------- */
async function dashboardPage(app) {
  layoutPage('/dashboard', 'WORKSPACE / <b>DASHBOARD</b>', '<div style="padding:40px"><span class="spin"></span></div>');
  let data;
  try { data = await api.listProjects(); }
  catch (e) { layoutPage('/dashboard', 'WORKSPACE / <b>DASHBOARD</b>', `<div class="form-error" style="margin:20px">Failed to load projects: ${esc(e.message)}</div>`); return; }
  const projects = data.projects;
  const nodeTotal = projects.reduce((s, p) => s + p.componentCount, 0);
  const inProgress = projects.filter((p) => p.status === 'in-progress').length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const user = JSON.parse(localStorage.getItem('a2c.user') || '{"email":"Developer"}');

  layoutPage('/dashboard', 'WORKSPACE / <b>DASHBOARD</b>', `
    <div style="display:flex;align-items:flex-end;gap:14px;margin:22px 0 6px">
      <div><h1>${greet}, ${esc(user.email.split('@')[0] || 'Developer')} 👋</h1>
      <p class="muted">Continue building your next system.</p></div>
      <div class="spacer" style="flex:1"></div>
      <input id="dash-search" placeholder="Search projects…" style="max-width:220px">
      <a class="btn primary" href="#/projects/new">＋ New Project</a>
    </div>
    <div class="stat-grid" style="margin:16px 0">
      <div class="card stat"><div class="num">${projects.length}</div><div class="lbl">Projects</div></div>
      <div class="card stat"><div class="num">${nodeTotal}</div><div class="lbl">Architecture components</div></div>
      <div class="card stat"><div class="num">${inProgress}</div><div class="lbl">In progress</div></div>
    </div>
    <div class="eyebrow" style="margin:20px 0 10px">START BUILDING</div>
    <div class="create-grid">
      <a class="create-card" href="#/projects/new?mode=upload"><div class="ic">📤</div><h3>Upload Architecture</h3><p>Import an Arch2Code JSON or attach a diagram file for storage.</p></a>
      <a class="create-card" href="#/projects/new"><div class="ic">✏️</div><h3>Draw Architecture</h3><p>Start from a blank canvas and design with the visual editor.</p></a>
      <a class="create-card" href="#/projects/new?mode=ai"><div class="ic">✦</div><h3>Describe with AI</h3><p>Write requirements in plain language, get an editable design proposal.</p></a>
    </div>
    <div style="display:flex;align-items:center;margin:26px 0 12px">
      <div class="eyebrow">RECENT PROJECTS</div><div class="spacer" style="flex:1"></div>
      <a href="#/projects" class="muted" style="font-size:12px">View all →</a>
    </div>
    <div id="recent-list">${projects.length ? projectGrid(projects.slice(0, 6)) : emptyState('🗂', 'No projects yet', 'Create your first architecture to see it here.', '<a class="btn primary" href="#/projects/new">＋ New Project</a>')}</div>
  `);
  $('#dash-search').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = projects.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    $('#recent-list').innerHTML = filtered.length ? projectGrid(filtered.slice(0, 6)) : emptyState('🔍', 'No matches', 'Try a different search term.');
  };
}

function projectGrid(projects) {
  return `<div class="proj-grid">${projects.map((p) => `
    <div class="card proj-card hover" style="position:relative" data-id="${esc(p.id)}">
      <div class="row">
        <span class="pill ${p.status === 'in-progress' ? 'warn' : p.status === 'ready' ? 'ok' : ''}">${esc(p.status)}</span>
        <span class="pill">${p.componentCount} components</span>
        <div class="spacer" style="flex:1"></div>
        <button class="btn ghost small proj-menu-btn" data-id="${esc(p.id)}" title="Actions">⋯</button>
      </div>
      <a href="#/editor/${esc(p.id)}" style="color:inherit;text-decoration:none">
        <h3 style="font-size:14px">${esc(p.name)}</h3>
        <p class="muted" style="font-size:12px;min-height:32px">${esc(p.description || 'No description')}</p>
      </a>
      <div class="row muted" style="font-size:11px;font-family:var(--mono)">
        <span>${p.technologies.slice(0, 3).map(esc).join(' · ') || 'no stack'}</span>
        <div class="spacer" style="flex:1"></div><span>${timeAgo(p.updatedAt)}</span>
      </div>
    </div>`).join('')}</div>`;
}

/* project card context menu (rename/duplicate/delete) — event delegation */
document.addEventListener('click', (e) => {
  const menuBtn = e.target.closest('.proj-menu-btn');
  // Menus opened by other surfaces (editor toolbar) manage themselves.
  if (!menuBtn) {
    if (!e.target.closest('#exp-menu-btn') && !e.target.closest('.menu')) {
      document.querySelectorAll('.menu').forEach((m) => m.remove());
    }
    return;
  }
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  e.preventDefault();
  const id = menuBtn.dataset.id;
  const card = menuBtn.closest('.proj-card');
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <button data-act="open">Open editor</button>
    <button data-act="rename">Rename</button>
    <button data-act="duplicate">Duplicate</button>
    <button data-act="export">Export JSON</button>
    <button data-act="delete" class="danger">Delete…</button>`;
  card.appendChild(menu);
  menu.onclick = async (ev) => {
    const act = ev.target.dataset.act;
    menu.remove();
    // Every action reports its own failure — a silent no-op button is a demo killer.
    try {
      if (act === 'open') navigate(`/editor/${id}`);
      if (act === 'rename') {
        const { projects } = await api.listProjects();
        const p = projects.find((x) => x.id === id);
        const name = prompt('Project name:', p?.name || '');
        if (name && name.trim()) {
          const full = await api.getProject(id);
          full.project.project.name = name.trim();
          await api.updateProject(id, full.project);
          toast('Renamed'); render();
        }
      }
      if (act === 'duplicate') {
        const full = await api.getProject(id);
        const { project } = await api.createProject({ ...full.project, duplicate: true });
        toast(`Duplicated as “${project.project.name}”`); render();
      }
      if (act === 'export') window.open(api.exportUrl(id), '_blank');
      if (act === 'delete') {
        if (!confirm('Delete this project permanently? This cannot be undone.')) return;
        await api.deleteProject(id);
        toast('Project deleted'); render();
      }
    } catch (err) {
      toast(`Could not ${act} project: ${err.message || err}`, 'err');
    }
  };
});
document.addEventListener('click', (e) => { if (!e.target.closest('.proj-menu-btn') && !e.target.closest('.menu') && !e.target.closest('#exp-menu-btn')) document.querySelectorAll('.menu').forEach((m) => m.remove()); });

/* ---------- 3. projects list & creation ---------- */
async function projectsPage(app) {
  layoutPage('/projects', 'WORKSPACE / <b>PROJECTS</b>', '<div style="padding:40px"><span class="spin"></span></div>');
  const { projects } = await api.listProjects();
  layoutPage('/projects', 'WORKSPACE / <b>PROJECTS</b>', `
    <div style="display:flex;align-items:center;margin:22px 0 14px"><h1>Project Library</h1><div class="spacer" style="flex:1"></div><a class="btn primary" href="#/projects/new">＋ New Project</a></div>
    ${projects.length ? projectGrid(projects) : emptyState('🗂', 'No projects', 'Create one from scratch, a template, or with AI.', '<a class="btn primary" href="#/projects/new">＋ New Project</a>')}`);
}

async function newProjectPage(app, _params, query) {
  const mode = query.get('mode') || '';
  const templates = await api.templates();
  layoutPage('/projects', 'WORKSPACE / <b>NEW PROJECT</b>', `
    <div style="margin:22px 0 14px"><h1>Create Project</h1><p class="muted" style="font-size:13px">Describe → design → validate → generate → export.</p></div>
    <div class="card" style="max-width:720px">
      <form class="form" id="np-form">
        <div class="form-error" id="np-err" hidden></div>
        <div class="field"><label>Project name *</label><input name="name" placeholder="e.g. Order Management System" required maxlength="120"></div>
        <div class="field"><label>Description</label><textarea name="description" rows="2" placeholder="What does this system do?"></textarea></div>
        <div class="field"><label>System type</label>
          <select name="systype"><option>Web application</option><option>API / backend</option><option>Event-driven system</option><option>Mobile backend</option><option>Data platform</option></select></div>
        <div class="field"><label>Technologies (comma separated)</label><input name="tech" placeholder="React, Node.js, PostgreSQL"></div>
        <div class="field"><label>Start from</label>
          <select name="source" id="np-source">
            <option value="blank">Blank architecture</option>
            <option value="ai" ${mode === 'ai' ? 'selected' : ''}>Describe with AI (generate proposal)</option>
            <option value="upload" ${mode === 'upload' ? 'selected' : ''}>Upload architecture JSON / diagram file</option>
            ${templates.templates.map((t) => `<option value="tpl:${t.key}">Template: ${esc(t.name)}</option>`).join('')}
          </select></div>
        <div class="field" id="ai-fields" hidden>
          <label>Describe the system in plain language *</label>
          <textarea name="ai-prompt" rows="4" placeholder="Build a scalable e-commerce system with React, Spring Boot services, PostgreSQL, Redis caching, and async order processing with Kafka."></textarea>
          <p class="muted" style="font-size:11px;margin-top:4px">Sent server-side to the AI provider. You review the proposal before it is applied.</p>
        </div>
        <div class="field" id="upload-fields" hidden>
          <label>Architecture file</label>
          <input type="file" name="file" accept=".json,application/json,.mmd,.mermaid,text/plain,image/png,image/jpeg">
          <p class="muted" style="font-size:11px;margin-top:4px">.json and Mermaid flowcharts (.mmd/.mermaid) import into the canvas. Images (.png/.jpg, max 10&nbsp;MB) are stored with a note — no picture recognition yet.</p>
        </div>
        <div style="display:flex;gap:8px"><button class="btn primary" type="submit" id="np-submit">Create project</button><a class="btn ghost" href="#/projects">Cancel</a></div>
      </form>
    </div>`);
  const form = $('#np-form');
  const src = $('#np-source');
  src.onchange = () => {
    $('#ai-fields').hidden = !src.value.startsWith('ai');
    $('#upload-fields').hidden = src.value !== 'upload';
  };
  src.onchange();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#np-err');
    err.hidden = true;
    const name = form.name.value.trim();
    if (!name) { err.textContent = 'Name is required.'; err.hidden = false; return; }
    const description = form.description.value.trim();
    const tech = form.tech.value.split(',').map((s) => s.trim()).filter(Boolean);
    const btn = $('#np-submit');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Working…';
    try {
      if (src.value.startsWith('tpl:')) {
        const { project } = await api.createProject({ template: src.value.slice(4), name, description });
        toast(`Project created from template — ${project.architecture.nodes.length} components preloaded`);
        navigate(`/editor/${project.project.id}`);
        return;
      }
      if (src.value === 'ai') {
        const prompt = form['ai-prompt'].value.trim();
        if (prompt.length < 10) { err.textContent = 'Describe the system in at least 10 characters.'; err.hidden = false; btn.disabled = false; btn.innerHTML = 'Create project'; return; }
        const { project } = await api.createProject({ name, description, technologies: tech });
        sessionStorage.setItem('a2c.pendingAI', JSON.stringify({ prompt }));
        toast('Project created — generating architecture proposal…');
        navigate(`/editor/${project.project.id}?ai=1`);
        return;
      }
      if (src.value === 'upload') {
        const file = form.file.files[0];
        if (!file) { err.textContent = 'Choose a file to upload.'; err.hidden = false; btn.disabled = false; btn.innerHTML = 'Create project'; return; }
        if (file.size > 10 * 1024 * 1024) { err.textContent = 'File exceeds 10 MB.'; err.hidden = false; btn.disabled = false; btn.innerHTML = 'Create project'; return; }
        if (/\.(mmd|mermaid)$/i.test(file.name)) {
          const text = await file.text();
          const { project } = await api.createProject({ name, description, technologies: tech });
          try {
            const res = await api.importMermaid(project.project.id, { text });
            toast(`Imported Mermaid diagram — ${res.stats.nodes} components, ${res.stats.edges} connections`);
            navigate(`/editor/${project.project.id}`);
          } catch (e) {
            await api.deleteProject(project.project.id).catch(() => {});
            err.textContent = `Mermaid import failed: ${e.message}`;
            err.hidden = false;
            btn.disabled = false; btn.innerHTML = 'Create project';
          }
          return;
        }
        if (file.name.endsWith('.json')) {
          const text = await file.text();
          let parsed;
          try { parsed = JSON.parse(text); } catch { err.textContent = 'Not valid JSON.'; err.hidden = false; btn.disabled = false; btn.innerHTML = 'Create project'; return; }
          // accept both full archive and {nodes,edges} partial
          const archive = parsed.schemaVersion ? parsed : { schemaVersion: '1.0.0', project: { name, description }, architecture: parsed, metadata: { technologies: tech } };
          archive.project = { ...archive.project, name, description };
          importArchive(archive);
          return;
        }
        // image / other: store metadata + note honestly
        const { project } = await api.createProject({ name, description, technologies: tech });
        project.architecture.nodes = [];
        sessionStorage.setItem('a2c.uploadedFile', JSON.stringify({ name: file.name, size: file.size, type: file.type, note: 'Stored for reference. Automatic diagram extraction is not implemented yet — rebuild the structure visually or import a JSON export instead.' }));
        toast('Project created. Note: image was attached as reference only.');
        navigate(`/editor/${project.project.id}`);
        return;
      }
      const { project } = await api.createProject({ name, description, technologies: tech });
      toast('Project created');
      navigate(`/editor/${project.project.id}`);
    } catch (ex) {
      err.textContent = ex.message + (ex.detail ? ` — ${JSON.stringify(ex.detail)}` : '');
      err.hidden = false;
      btn.disabled = false; btn.innerHTML = 'Create project';
    }
  };
}

async function importArchive(archive) {
  // client-side schema check first for friendly errors
  const { project } = await api.createProject({ name: archive.project.name || 'Imported project', description: archive.project.description || '' });
  project.architecture = archive.architecture;
  project.metadata = archive.metadata || project.metadata;
  project.project.name = archive.project.name || project.project.name;
  project.project.description = archive.project.description || project.project.description;
  try {
    const saved = await api.updateProject(project.project.id, project);
    toast('Imported architecture');
    navigate(`/editor/${saved.project.project.id}`);
  } catch (e) {
    toast(`Import rejected: ${e.message}`, 'err');
    await api.deleteProject(project.project.id);
  }
}

/* ---------- 4. templates & generations & docs & settings ---------- */
async function templatesPage(app) {
  const { templates } = await api.templates();
  layoutPage('/templates', 'WORKSPACE / <b>TEMPLATES</b>', `
    <div style="margin:22px 0 14px"><h1>Architecture Templates</h1><p class="muted" style="font-size:13px">Each template creates real nodes and edges you can customize.</p></div>
    <div class="proj-grid">${templates.map((t) => `
      <div class="card hover">
        <span class="pill">${t.key}</span>
        <h3 style="margin:10px 0 4px;font-size:14px">${esc(t.name)}</h3>
        <p class="muted" style="font-size:12px;min-height:36px">${esc(t.description)}</p>
        <button class="btn primary small tpl-use" data-key="${t.key}">Use template</button>
      </div>`).join('')}</div>`);
  app.querySelectorAll('.tpl-use').forEach((b) => {
    b.onclick = async () => {
      const name = prompt('Project name:', b.dataset.key);
      if (!name) return;
      await busy(b, async () => {
        const { project } = await api.createProject({ template: b.dataset.key, name });
        navigate(`/editor/${project.project.id}`);
      });
    };
  });
}

async function generationsPage(app) {
  layoutPage('/generations', 'WORKSPACE / <b>AI GENERATIONS</b>', '<div style="padding:40px"><span class="spin"></span></div>');
  const { generations } = await api.listGenerations();
  layoutPage('/generations', 'WORKSPACE / <b>AI GENERATIONS</b>', `
    <div style="margin:22px 0 14px"><h1>Generation History</h1>
      <p class="muted" style="font-size:13px">Every AI generation attempt is recorded with its provider and outcome.</p></div>
    ${generations.length === 0 ? emptyState('✦', 'No generations yet', 'Describe a system on the dashboard or in the editor to generate an architecture proposal.') :
    `<div style="display:flex;flex-direction:column;gap:8px">${generations.map((g) => `
      <div class="list-row">
        <span class="pill ${g.status === 'success' ? 'ok' : ''}">${esc(g.status)}</span>
        <div style="flex:1">
          <div style="font-size:13px">${esc(g.kind)} · provider <span class="mono">${esc(g.provider)}</span>${g.model ? ` · <span class="mono">${esc(g.model)}</span>` : ''}</div>
          <div class="muted" style="font-size:11px;font-family:var(--mono)">${g.nodeCount ?? '—'} nodes · ${g.edgeCount ?? '—'} edges · ${g.durationMs ?? '—'}ms · ${new Date(g.timestamp).toLocaleString()}</div>
          ${g.error ? `<div style="color:var(--err);font-size:11px;margin-top:2px">${esc(g.error)}</div>` : ''}
        </div>
      </div>`).join('')}</div>`}`);
}

/* ---------- 4b. generated code workspace (browse + live sandbox) ---------- */
function serviceNames(files) {
  const names = new Set();
  for (const f of files) {
    const m = f.path.match(/^services\/([^/]+)\//);
    if (m) names.add(m[1]);
  }
  return [...names];
}

/**
 * Open one generated service package in StackBlitz (WebContainers).
 * Uses StackBlitz's documented form POST API, so nothing is installed locally
 * and no API key/account is needed. Files are re-rooted from services/<name>/.
 */
function openInStackBlitz(projectName, service, files) {
  const prefix = service ? `services/${service}/` : '';
  const picked = files.filter((f) => f.path.startsWith(prefix))
    .map((f) => ({ path: f.path.slice(prefix.length), content: f.content }));
  if (!picked.length) { toast('No files to open for this service', 'err'); return; }
  let dependencies = {};
  try {
    const pkg = picked.find((f) => f.path === 'package.json');
    if (pkg) dependencies = JSON.parse(pkg.content).dependencies || {};
  } catch { /* keep empty; sandbox still opens */ }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://stackblitz.com/run';
  form.target = '_blank';
  form.style.display = 'none';
  const add = (name, value) => {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = name; i.value = value;
    form.appendChild(i);
  };
  add('project[title]', `${projectName} — ${service || 'scaffold'}`);
  add('project[description]', 'Generated by Arch2Code AI. Scaffold only — implement the TODOs.');
  add('project[template]', 'node');
  for (const f of picked) add(`project[files][${f.path}]`, f.content);
  add('project[dependencies]', JSON.stringify(dependencies));
  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 3000);
  toast('Opening live sandbox in a new tab — first boot runs npm install');
}

async function codePage(app, params, query) {
  const crumb = 'WORKSPACE / <b>GENERATED CODE</b>';
  layoutPage('/code', crumb, '<div style="padding:40px"><span class="spin"></span></div>');

  let projects;
  try { ({ projects } = await api.listProjects()); }
  catch (e) {
    layoutPage('/code', crumb, `<div class="card" style="margin-top:22px">Failed to list projects: ${esc(e.message)}</div>`);
    return;
  }
  if (!projects.length) {
    layoutPage('/code', crumb, emptyState('⌘', 'Nothing to generate yet',
      'Create a project and add components — the code view turns the saved architecture into a Node + TypeScript scaffold.',
      '<a class="btn primary" href="#/projects/new">＋ New Project</a>'));
    return;
  }

  const wanted = params.projectId || (query && query.get('project')) || '';
  const projectId = projects.some((p) => p.id === wanted) ? wanted : projects[0].id;
  const project = projects.find((p) => p.id === projectId);

  layoutPage('/code', crumb, `
    <div style="margin:22px 0 14px;display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div>
        <h1 style="margin:0">Generated code</h1>
        <p class="muted" style="font-size:13px;max-width:700px;margin:6px 0 0">
          Generated deterministically from the saved architecture JSON — never from canvas positions.
          Browse the files, then download them or open a service in an in-browser sandbox to develop live.
        </p>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <select id="code-project" style="width:auto;min-width:200px" title="Project">
          ${projects.map((p) => `<option value="${p.id}"${p.id === projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <button class="btn small" id="code-refresh" title="Re-run the generator against the saved architecture">↻ Regenerate</button>
      </div>
    </div>
    <div id="code-status" class="muted" style="font-size:12px;margin-bottom:10px"><span class="spin"></span> Generating…</div>
    <div style="display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:12px;height:calc(100vh - 300px);min-height:340px">
      <div class="card" id="code-tree" style="padding:8px;overflow:auto"></div>
      <div class="card" style="padding:0;display:flex;flex-direction:column;min-width:0;overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border)">
          <span id="code-path" class="mono" style="font-size:11px;color:var(--text2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">—</span>
          <button class="btn small" id="code-copy">Copy</button>
          <button class="btn small" id="code-download">Download file</button>
        </div>
        <div style="display:flex;flex:1;overflow:auto;background:var(--bg);font-family:var(--mono);font-size:11.5px;line-height:1.55">
          <div id="code-gutter" style="padding:10px 8px;text-align:right;color:#4a4c63;user-select:none;border-right:1px solid var(--border);white-space:pre"></div>
          <pre id="code-body" style="margin:0;padding:10px 12px;white-space:pre"></pre>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
      <select id="code-service" style="width:auto;min-width:190px" title="Service package to open"></select>
      <button class="btn primary" id="code-live" title="Open this service in StackBlitz WebContainers">▶ Open live dev sandbox</button>
      <a class="btn" id="code-zip" href="${api.exportUrl(projectId, 'zip')}" target="_blank" rel="noopener">⇩ Download ZIP</a>
      <a class="btn" href="#/editor/${projectId}">Open in editor</a>
    </div>
    <p class="muted" style="font-size:11px;margin:10px 0 0;max-width:820px">
      <b>Live dev:</b> the sandbox opens the selected service in StackBlitz (WebContainers) — it installs dependencies in your browser
      and runs <code class="mono">npm run dev</code>, so you see a real dev server without installing anything locally. No account is required.
      <b>Local IDE:</b> a VS Code / JetBrains hand-off is not built in — download the ZIP, unzip it, and open the service folder in your IDE
      for the same live workflow with your own tooling.
    </p>`);

  const treeEl = app.querySelector('#code-tree');
  const statusEl = app.querySelector('#code-status');
  const pathEl = app.querySelector('#code-path');
  const gutterEl = app.querySelector('#code-gutter');
  const bodyEl = app.querySelector('#code-body');
  const svcEl = app.querySelector('#code-service');
  const liveBtn = app.querySelector('#code-live');
  let files = [];
  let current = null;

  app.querySelector('#code-project').onchange = (e) => navigate(`/code/${e.target.value}`);
  app.querySelector('#code-refresh').onclick = () => load();

  function setFile(f) {
    if (!f) return;
    current = f;
    pathEl.textContent = `${f.path} · ${f.bytes} B`;
    gutterEl.textContent = f.content.split('\n').map((_, i) => i + 1).join('\n');
    bodyEl.textContent = f.content;
    treeEl.querySelectorAll('.code-file').forEach((b) => {
      b.style.background = b.dataset.path === f.path ? 'rgba(139,92,246,.18)' : 'transparent';
      b.style.color = b.dataset.path === f.path ? 'var(--purple-h)' : 'var(--text2)';
    });
  }

  function renderTree() {
    const groups = new Map();
    for (const f of files) {
      const i = f.path.lastIndexOf('/');
      const dir = i >= 0 ? f.path.slice(0, i) : '';
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push(f);
    }
    treeEl.innerHTML = [...groups.entries()].map(([dir, list]) => `
      ${dir ? `<div class="pal-cat" style="padding:8px 6px 3px">${esc(dir)}</div>` : ''}
      ${list.map((f) => `<button class="code-file" data-path="${esc(f.path)}" style="display:block;width:100%;text-align:left;padding:4px 6px;border:0;border-radius:4px;background:transparent;color:var(--text2);font-family:var(--mono);font-size:10.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(dir ? f.path.slice(dir.length + 1) : f.path)}</button>`).join('')}`).join('');
    treeEl.querySelectorAll('.code-file').forEach((b) => {
      b.onclick = () => setFile(files.find((f) => f.path === b.dataset.path));
    });
  }

  app.querySelector('#code-copy').onclick = async () => {
    if (!current) return;
    try { await navigator.clipboard.writeText(current.content); toast(`Copied ${current.path}`, 'ok'); }
    catch { toast('Clipboard blocked by the browser', 'err'); }
  };
  app.querySelector('#code-download').onclick = () => {
    if (!current) return;
    const blob = new Blob([current.content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = current.path.split('/').pop() || 'file.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  liveBtn.onclick = () => {
    if (!files.length) return;
    openInStackBlitz(project.name, svcEl.value || null, files);
  };

  async function load() {
    statusEl.innerHTML = '<span class="spin"></span> Generating…';
    treeEl.innerHTML = '';
    bodyEl.textContent = '';
    gutterEl.textContent = '';
    pathEl.textContent = '—';
    try {
      const gen = await api.getCode(projectId);
      files = gen.files;
      if (!files.length) {
        statusEl.textContent = 'No code could be generated for this architecture.';
        liveBtn.disabled = true;
        svcEl.disabled = true;
        return;
      }
      const skipped = gen.skipped?.length ? ` · ${gen.skipped.length} component(s) with no generator (TODOs)` : '';
      statusEl.innerHTML = `<span class="pill ok">ok</span> ${files.length} files · ${(gen.stats.bytes / 1024).toFixed(1)} KB · ${esc(gen.target?.label || 'Node + TypeScript')}${skipped}`;
      const names = serviceNames(files);
      svcEl.innerHTML = names.length
        ? names.map((n) => `<option value="${esc(n)}">services/${esc(n)}</option>`).join('')
        : '<option value="">(root files)</option>';
      svcEl.disabled = !names.length;
      liveBtn.disabled = false;
      renderTree();
      setFile(files.find((f) => /^README\.md$/i.test(f.path)) || files[0]);
    } catch (e) {
      statusEl.innerHTML = `<span class="form-error" style="display:inline-block">Code generation failed: ${esc(e.message)}</span>`;
      liveBtn.disabled = true;
    }
  }
  load();
}

function docsPage(app) {
  layoutPage('/docs', 'WORKSPACE / <b>DOCUMENTATION</b>', `
    <div class="doc" style="margin:22px 0;max-width:760px">
      <h1>Documentation</h1>
      <h2>Create a project</h2><p>Open <b>New Project</b>, pick a name, choose a starting point (blank, template, AI description, upload) and you land in the editor.</p>
      <h2>Canvas</h2>
      <ul><li>Drag components from the left palette onto the canvas (or click them to drop at center).</li>
      <li>Connect by dragging a node's right handle onto another node's left handle; the connection forms instantly.</li>
      <li>Click a node or edge to select and edit its properties in the right inspector.</li>
      <li>Delete with the <span class="kbd">Delete</span> key or inspector buttons.</li>
      <li><span class="kbd">Ctrl</span>+<span class="kbd">Z</span> undo · <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">Z</span> redo · <span class="kbd">Ctrl</span>+<span class="kbd">S</span> save · <span class="kbd">Ctrl</span>+<span class="kbd">D</span> duplicate · <span class="kbd">Esc</span> clear selection.</li></ul>
      <h2>Validate</h2><p>The <b>Validate</b> button runs the deterministic engine server-side. It checks broken references, self-connections, disconnected components, cycles, unreachable data stores, and duplicate names — then shows the results so you can click an issue to focus the component.</p>
      <h2>Save & export</h2><p>Saving writes atomically to <code>data/projects/&lt;id&gt;.json</code>. Export buttons produce architecture JSON, a validation report, or a ZIP scaffold of the generated Node+TS code.</p>
      <h2>AI generation</h2><p>Your description is sent to a server-side provider (Groq) via <code>/api/ai/generate</code>; the structured proposal is validated against the schema and shown for review before applying. If no provider is configured, a clearly-labeled deterministic demo generator runs instead — the UI always tells you which one produced the result.</p>
      <h2>Code generation</h2><p>The generator consumes the canonical architecture JSON (never the canvas pixels) and emits a deterministic Node.js + TypeScript scaffold: package.json, tsconfig, Fastify entry point, .env.example, Dockerfile, README, smoke test. Run it any time with <b>⌘ Code</b> in the editor to browse the files and download the ZIP; applying an AI proposal generates the scaffold automatically once the architecture is saved. Components without a generator are listed as explicit TODOs, not silently dropped. Scaffolding is unfinished software — read the TODOs.</p>
      <h2>Generated code & live development</h2><p>The <b>Generated Code</b> section in the sidebar is the full-screen version of the editor's code modal: pick a project, browse every generated file with line numbers, copy or download a single file, or grab the whole scaffold as a ZIP.</p>
      <p><b>Live dev sandbox:</b> <b>Open live dev sandbox</b> posts the selected service package to StackBlitz's WebContainers runtime in a new tab. It installs the service's dependencies inside your browser and runs <code>npm run dev</code> (<code>tsx watch src/index.ts</code>), so you get a real running dev server without installing anything on this machine or creating an account. It is a third-party service: your scaffold leaves this app when you click it.</p>
      <p><b>Local IDE:</b> VS Code / JetBrains integration is not built in — that would mean writing scaffold files into a folder on this machine and launching an editor process, which this local-first app does not do yet. The reliable hand-off today is the ZIP: download it, unzip it, open the service folder in your IDE, then <code>npm install && npm run dev</code>.</p>
      <h2>Current limitations</h2>
      <ul><li>Local single-user storage: no auth, no multi-tenant security. Not a production database.</li>
      <li>Auth page is a local demo identity; nothing is verified server-side.</li>
      <li>Image/diagram upload stores files as reference only — no automatic extraction.</li>
      <li>Generated code is scaffold material, not finished features.</li>
      <li>Validation is structural — passing it does not mean the design is correct.</li>
      <li>Live AI generation requires a Groq API key in <code>.env</code> (<code>GROQ_API_KEY</code>). Without it — or if the provider fails — generation falls back to a clearly labeled demo proposal (<code>DEMO_MODE=1</code> forces it, <code>AI_FALLBACK=off</code> disables the safety net).</li>
      <li>AI requests are rate limited per IP (default 12 per 5 minutes) to protect the API key.</li></ul>
    </div>`);
}

function settingsPage(app) {
  const prefs = JSON.parse(localStorage.getItem('a2c.prefs') || '{}');
  layoutPage('/settings', 'WORKSPACE / <b>SETTINGS</b>', `
    <div style="margin:22px 0 14px"><h1>Settings</h1></div>
    <div class="card" style="max-width:640px;display:flex;flex-direction:column;gap:14px">
      <div><div class="eyebrow">CANVAS</div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px">
          <input type="checkbox" id="pref-snap" ${prefs.snap !== false ? 'checked' : ''} style="width:auto"> Snap to grid</label></div>
      <div><div class="eyebrow">AI PROVIDER</div>
        <div id="ai-status" class="muted" style="font-size:12px;margin-top:6px"><span class="spin"></span> checking…</div></div>
      <div><div class="eyebrow">EXPORT DEFAULTS</div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px">
          <input type="checkbox" id="pref-minify" ${prefs.minify ? 'checked' : ''} style="width:auto"> Minify exported JSON</label></div>
      <div><div class="eyebrow">DATA</div>
        <button class="btn danger small" id="clear-local" style="margin-top:8px">Clear local UI prefs</button>
        <p class="muted" style="font-size:11px;margin-top:6px">Projects live in <code class="mono">data/</code> on disk — clearing these prefs does not touch them.</p></div>
    </div>`);
  $('#pref-snap').onchange = (e) => savePrefs({ snap: e.target.checked });
  $('#pref-minify').onchange = (e) => savePrefs({ minify: e.target.checked });
  $('#clear-local').onclick = () => { localStorage.removeItem('a2c.prefs'); toast('Cleared'); render(); };
  api.health().then((h) => {
    $('#ai-status').innerHTML = h.aiProvider.startsWith('groq')
      ? `<span class="pill ok">Groq live · model in env</span>${h.aiFallback ? '<span class="pill" style="margin-left:6px">demo fallback armed</span>' : ''}`
      : `<span class="pill">${esc(h.aiProvider)} — add GROQ_API_KEY in .env for live generation</span>`;
  });
}
function savePrefs(patch) {
  const prefs = JSON.parse(localStorage.getItem('a2c.prefs') || '{}');
  localStorage.setItem('a2c.prefs', JSON.stringify({ ...prefs, ...patch }));
}

/* ---------- 5. ARCHITECTURE EDITOR ---------- */
const N_W = 180, N_H = 64;

async function editorPage(app, params, query) {
  const projectId = params.projectId;
  let loaded;
  try { loaded = await api.getProject(projectId); }
  catch (e) {
    app.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px">
      <div class="eyebrow">${e.status === 404 ? 'NOT FOUND' : 'ERROR'}</div>
      <h1>${e.status === 404 ? 'Project not found' : 'Failed to load'}</h1>
      <p class="muted">${esc(e.message)}</p><a class="btn" href="#/projects">Back to projects</a></div>`;
    return;
  }
  const project = loaded.project;
  const prefs = JSON.parse(localStorage.getItem('a2c.prefs') || '{}');

  /* ----- graph state (single source of truth) + undo/redo ----- */
  const state = {
    nodes: project.architecture.nodes.map((n) => ({ ...n, position: { ...n.position }, data: { ...n.data, tags: [...(n.data.tags || [])], envVarNames: [...(n.data.envVarNames || [])], endpoints: [...(n.data.endpoints || [])] } })),
    edges: project.architecture.edges.map((e) => ({ ...e })),
    selection: null, // {kind:'node'|'edge', id}
    dirty: false, saving: false, lastSaved: null,
    issues: [], inspection: 'issues', showIssues: true,
    pendingConnect: null, // {fromId} while dragging new connection
    mouse: { x: 0, y: 0 }, pan: { x: 0, y: 0 }, zoom: 1,
    history: [], future: [],
    justSaved: 0,
  };

  const snapshot = () => JSON.stringify({ nodes: state.nodes, edges: state.edges });
  let lastSnapshot = snapshot();
  function pushHistory() {
    state.history.push(lastSnapshot);
    if (state.history.length > 60) state.history.shift();
    state.future = [];
    lastSnapshot = snapshot();
  }
  function undo() {
    if (!state.history.length) return;
    state.future.push(snapshot());
    const prev = state.history.pop();
    applySnapshot(prev);
  }
  function redo() {
    if (!state.future.length) return;
    state.history.push(snapshot());
    const nxt = state.future.pop();
    applySnapshot(nxt);
  }
  function applySnapshot(s) {
    const d = JSON.parse(s);
    state.nodes = d.nodes; state.edges = d.edges;
    if (state.selection && !findNode(state.selection.id) && !state.edges.some((e) => e.id === state.selection.id)) state.selection = null;
    lastSnapshot = snapshot(); state.dirty = true; draw();
  }
  const findNode = (id) => state.nodes.find((n) => n.id === id);

  /* ----- canvas & interactions ----- */
  const snap = (v) => prefs.snap !== false ? Math.round(v / 10) * 10 : v;
  function canvasPoint(evt) {
    const r = $('#cv').getBoundingClientRect();
    return { x: (evt.clientX - r.left - state.pan.x) / state.zoom, y: (evt.clientY - r.top - state.pan.y) / state.zoom };
  }
  function nodeAt(pt) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const n = state.nodes[i];
      if (pt.x >= n.position.x && pt.x <= n.position.x + N_W && pt.y >= n.position.y && pt.y <= n.position.y + N_H) return n;
    }
    return null;
  }
  function hitHandle(pt) {
    const hN = nodeAt(pt);
    if (!hN) return null;
    const hx = hN.position.x + N_W, hy = hN.position.y + N_H / 2;
    if (Math.hypot(pt.x - hx, pt.y - hy) < 12) return hN;
    return null;
  }
  function edgeAt(pt, tol = 8) {
    for (const e of state.edges) {
      const s = findNode(e.source), t = findNode(e.target);
      if (!s || !t) continue;
      const [x1, y1, x2, y2] = [s.position.x + N_W, s.position.y + N_H / 2, t.position.x, t.position.y + N_H / 2];
      const mx = (x1 + x2) / 2;
      const d = pt.x >= Math.min(x1, x2) - tol && pt.x <= Math.max(x1, x2) + tol && pt.y >= Math.min(y1, y2) - tol && pt.y <= Math.max(y1, y2) + tol;
      // rough hit: inside bbox and near bezier by sampling
      if (!d) continue;
      for (let tt = 0; tt <= 1; tt += 0.05) {
        const bx = bez(x1, mx, x2, tt), by = bez(y1, mx, y2, tt);
        if (Math.hypot(pt.x - bx, pt.y - by) < tol) return e;
      }
    }
    return null;
  }
  const bez = (a, c, b, t) => { const u = 1 - t; return u * u * a + 2 * u * t * c + t * t * b; };

  /* ----- render pipeline ----- */
  function draw() {
    const defCounts = {};
    // palette unchanged; redraw canvas svg
    $('#cv-wrap-inner').innerHTML = `
      <svg id="cv" class="canvas" tabindex="0">
        <g id="world" transform="translate(${state.pan.x},${state.pan.y}) scale(${state.zoom})">
          <g id="dots-layer">${dotsSVG()}</g>
          <g id="edges-layer">${edgesSVG()}</g>
          <g id="nodes-layer">${nodesSVG()}</g>
          ${state.pendingConnect ? `<line x1="${state.pendingConnect.from.x}" y1="${state.pendingConnect.from.y}" x2="${state.mouse.x}" y2="${state.mouse.y}" stroke="var(--purple)" stroke-dasharray="4 3"/>` : ''}
        </g>
      </svg>`;
    $('#minimap').innerHTML = minimapSVG();
    $('#save-dot').className = `save-dot ${state.dirty ? 'dirty' : 'saved'}`;
    $('#save-label').textContent = state.saving ? 'Saving…' : state.dirty ? 'Unsaved changes' : state.lastSaved ? `Saved ${timeAgo(state.lastSaved)}` : 'Saved';
    $('#undo-btn').disabled = !state.history.length;
    $('#redo-btn').disabled = !state.future.length;
    renderInspector();
    renderIssues();
  }
  function dotsSVG() {
    const step = 26;
    const w = ($('#cv-wrap')?.clientWidth || 1200) / state.zoom + step * 2;
    const h = ($('#cv-wrap')?.clientHeight || 800) / state.zoom + step * 2;
    const x0 = Math.floor((-state.pan.x / state.zoom) / step) * step - step;
    const y0 = Math.floor((-state.pan.y / state.zoom) / step) * step - step;
    let out = '';
    for (let x = x0; x < x0 + w; x += step) for (let y = y0; y < y0 + h; y += step) out += `<circle class="dots" cx="${x}" cy="${y}" r="1"/>`;
    return out;
  }
  function edgesSVG() {
    return state.edges.map((e) => {
      const s = findNode(e.source), t = findNode(e.target);
      if (!s || !t) return '';
      const x1 = s.position.x + N_W, y1 = s.position.y + N_H / 2, x2 = t.position.x, y2 = t.position.y + N_H / 2;
      const mx = (x1 + x2) / 2;
      const sel = state.selection?.kind === 'edge' && state.selection.id === e.id;
      const ax = x2 - 10, ah = 5;
      const midx = bez(x1, mx, x2, 0.5), midy = bez(y1, mx, y2, 0.5);
      const angle = Math.atan2(y2 - y1, x2 - x1) * 0.35;
      return `<g class="edge-g" data-edge="${e.id}" style="cursor:pointer">
        <path class="edge-line${sel ? ' selected' : ''}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>
        <polygon class="edge-arrow${sel ? ' selected' : ''}" points="${ax},${y2} ${ax - ah},${y2 - ah} ${ax - ah},${y2 + ah}" transform="rotate(${angle * 57.3} ${ax} ${y2})"/>
        ${e.label ? `<text class="edge-label" x="${midx}" y="${midy - 6}" text-anchor="middle">${esc(e.label)}</text>` : ''}
        <path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="transparent" stroke-width="14" fill="none"/>
      </g>`;
    }).join('');
  }
  function nodesSVG() {
    return state.nodes.map((n) => {
      const c = CATALOG[n.type] || { icon: '❓', color: '#9395AD', category: 'Unknown' };
      const sel = state.selection?.kind === 'node' && state.selection.id === n.id;
      return `<g class="g-node${sel ? ' selected' : ''}" data-node="${n.id}" transform="translate(${n.position.x},${n.position.y})">
        <rect class="box" width="${N_W}" height="${N_H}" rx="8"/>
        <rect width="4" height="${N_H}" rx="2" fill="${c.color}"/>
        <text x="14" y="24" font-size="13" font-weight="600">${esc(n.data.name)}</text>
        <text x="14" y="40" font-size="9" fill="#9395AD" font-family="var(--mono)">${esc(c.icon)} ${esc(c.category)} · ${esc(n.data.technology || '—')}</text>
        <text x="14" y="54" font-size="8" fill="#565873" font-family="var(--mono)">${esc(envBadge(n))}${n.data.port ? ' · :' + n.data.port : ''}${n.data.environment ? ' · ' + esc(n.data.environment) : ''}</text>
        <circle class="handle" cx="${N_W}" cy="${N_H / 2}" r="5"/>
        <circle class="handle" cx="0" cy="${N_H / 2}" r="5" style="opacity:0"/>
      </g>`;
    }).join('');
  }
  const envBadge = (n) => (n.data.envVarNames?.length ? `🔐${n.data.envVarNames.length}` : '');
  function minimapSVG() {
    if (!state.nodes.length) return `<div class="muted" style="font-size:10px">empty canvas</div>`;
    const xs = state.nodes.map((n) => n.position.x), ys = state.nodes.map((n) => n.position.y);
    const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + N_W + 40, maxY = Math.max(...ys) + N_H + 40;
    const sc = Math.min(240 / (maxX - minX), 150 / (maxY - minY));
    const s = (v, o = false) => (o ? (v - (o === 1 ? 0 : 0)) * sc : (v - (minY)) * sc);
    const edges = state.edges.map((e) => {
      const sn = findNode(e.source), tn = findNode(e.target);
      if (!sn || !tn) return '';
      return `<line x1="${(sn.position.x - minX) * sc}" y1="${(sn.position.y - minY) * sc}" x2="${(tn.position.x - minX) * sc}" y2="${(tn.position.y - minY) * sc}" stroke="#3A3D50" stroke-width="0.7"/>`;
    }).join('');
    const nodes = state.nodes.map((n) => `<rect x="${(n.position.x - minX) * sc}" y="${(n.position.y - minY) * sc}" width="${N_W * sc}" height="${N_H * sc}" rx="1.5" fill="${(CATALOG[n.type]?.color) || '#555'}" opacity="0.8"/>`).join('');
    return `<svg width="100%" viewBox="0 0 240 150">${edges}${nodes}</svg>`;
  }
  function renderInspector() {
    const el = $('#inspector');
    if (!state.selection) { el.innerHTML = `<div class="eyebrow">INSPECTOR</div><p class="muted" style="font-size:12px;margin-top:10px">Select a component or connection to edit its properties.</p>`; return; }
    if (state.selection.kind === 'node') {
      const n = findNode(state.selection.id);
      if (!n) { state.selection = null; renderInspector(); return; }
      const c = CATALOG[n.type] || {};
      const inc = state.edges.filter((e) => e.target === n.id);
      const out = state.edges.filter((e) => e.source === n.id);
      el.innerHTML = `
        <div class="eyebrow">COMPONENT</div>
        <h3>${esc(n.data.name)}</h3>
        <span class="pill">${esc(c.category)} · ${esc(n.type)}</span>
        <div class="sec form">
          <div class="field"><label>Name</label><input data-prop="name" value="${esc(n.data.name)}"></div>
          <div class="field"><label>Type</label><select data-prop="type">${Object.entries(CATALOG).map(([k, v]) => `<option value="${k}" ${k === n.type ? 'selected' : ''}>${v.icon} ${esc(v.label)} — ${k}</option>`).join('')}</select></div>
          <div class="field"><label>Technology</label><input data-prop="technology" value="${esc(n.data.technology)}" placeholder="e.g. Node.js, Fastify"></div>
          <div class="field"><label>Description</label><textarea data-prop="description" rows="2">${esc(n.data.description)}</textarea></div>
          <div class="field"><label>Environment</label><select data-prop="environment">${['production', 'staging', 'development'].map((x) => `<option ${x === n.data.environment ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="field"><label>Port</label><input data-prop="port" type="number" value="${n.data.port ?? ''}"></div>
          <div class="field"><label>Tags (comma separated)</label><input data-prop="tags" value="${esc(n.data.tags.join(', '))}"></div>
          <div class="field"><label>Env var NAMES (never values · comma separated)</label><input data-prop="envVarNames" value="${esc(n.data.envVarNames.join(', '))}" placeholder="DATABASE_URL,AUTH_SECRET_NAME"></div>
          <div class="field"><label>API endpoints (comma separated)</label><input data-prop="endpoints" value="${esc(n.data.endpoints.join(', '))}" placeholder="/api/orders,/api/orders/:id"></div>
          <div class="field"><label>Implementation notes</label><textarea data-prop="notes" rows="2">${esc(n.data.notes)}</textarea></div>
          <div class="eyebrow">CONNECTIONS</div>
          <div style="font-size:12px" class="muted">
            ${inc.length ? `in: ${inc.map((e) => esc(findNode(e.source)?.data?.name || '?')).join(', ')}` : 'no incoming'}<br>
            ${out.length ? `out: ${out.map((e) => esc(findNode(e.target)?.data?.name || '?')).join(', ')}` : 'no outgoing'}
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <button class="btn small" id="ins-dup">Duplicate</button>
            <button class="btn danger small" id="ins-del">Delete</button>
          </div>
        </div>`;
      el.querySelectorAll('[data-prop]').forEach((inp) => {
        inp.oninput = () => {
          const prop = inp.dataset.prop;
          let val = inp.value;
          if (prop === 'port') val = val === '' ? null : Number(val);
          if (['tags', 'envVarNames', 'endpoints'].includes(prop)) val = val.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
          pushHistory();
          if (prop === 'name' && !val.trim()) return; // don't wipe names
          n.data[prop] = val;
          state.dirty = true;
          draw();
        };
      });
      $('#ins-dup').onclick = () => duplicateNode(n.id);
      $('#ins-del').onclick = () => deleteSelection();
    } else {
      const e = state.edges.find((x) => x.id === state.selection.id);
      if (!e) { state.selection = null; renderInspector(); return; }
      const s = findNode(e.source), t = findNode(e.target);
      el.innerHTML = `
        <div class="eyebrow">CONNECTION</div>
        <h3 style="font-size:12px" class="mono">${esc(s?.data?.name)} → ${esc(t?.data?.name)}</h3>
        <div class="sec form">
          <div class="field"><label>Relationship</label><select data-prop="relationship">
            ${[['sync-call', 'Synchronous call'], ['async-event', 'Async event'], ['data-read', 'Reads data'], ['data-write', 'Writes data']].map(([k, l]) => `<option value="${k}" ${e.relationship === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Label</label><input data-prop="label" value="${esc(e.label || '')}" placeholder="e.g. HTTPS, sql, order.created"></div>
          <button class="btn danger small" id="ins-del">Delete connection</button>
        </div>`;
      el.querySelectorAll('[data-prop]').forEach((inp) => {
        inp.oninput = () => { pushHistory(); e[inp.dataset.prop] = inp.value; state.dirty = true; draw(); };
      });
      $('#ins-del').onclick = () => deleteSelection();
    }
  }
  function renderIssues() {
    const el = $('#issues');
    if (!state.issues.length) { el.innerHTML = `<div class="form-ok" style="margin:4px 0">No structural issues found (this checks structure, not design quality).</div>`; return; }
    el.innerHTML = state.issues.map((iss) => `
      <div class="issue" data-nodes="${esc((iss.nodeIds || []).join(','))}" data-edges="${esc((iss.edgeIds || []).join(','))}">
        <span class="sev ${iss.severity}">${iss.severity}</span>
        <div><div>${esc(iss.message)}</div>${iss.hint ? `<div class="muted" style="font-size:11px">${esc(iss.hint)}</div>` : ''}</div>
      </div>`).join('');
    el.querySelectorAll('.issue').forEach((row) => {
      row.onclick = () => {
        const nid = row.dataset.nodes.split(',')[0];
        const eid = row.dataset.edges.split(',')[0];
        if (nid && findNode(nid)) { state.selection = { kind: 'node', id: nid }; draw(); focusNode(nid, false); }
        else if (eid) { state.selection = { kind: 'edge', id: eid }; draw(); }
      };
    });
  }
  function focusNode(id, centerIfOff = true) {
    const n = findNode(id);
    if (!n) return;
    const wrap = $('#cv-wrap');
    const vw = wrap.clientWidth, vh = wrap.clientHeight;
    if (centerIfOff) {
      state.pan.x = vw / 2 - (n.position.x + N_W / 2) * state.zoom;
      state.pan.y = vh / 2 - (n.position.y + N_H / 2) * state.zoom;
    }
    draw();
  }

  /* ----- mutations ----- */
  function addNode(type, position) {
    pushHistory();
    const c = CATALOG[type] || {};
    let name = c.label || type;
    if (state.nodes.some((n) => n.data.name === name)) {
      let i = 2;
      while (state.nodes.some((n) => n.data.name === `${name} ${i}`)) i++;
      name = `${name} ${i}`;
    }
    const node = {
      id: uid('n'), type,
      position: { x: snap(position.x - N_W / 2), y: snap(position.y - N_H / 2) },
      data: { name, technology: c.tech || '', description: '', environment: 'production', port: null, tags: [], envVarNames: [], endpoints: [], notes: '' },
      meta: { width: N_W, height: N_H },
    };
    state.nodes.push(node);
    state.selection = { kind: 'node', id: node.id };
    state.dirty = true;
    draw();
  }
  function duplicateNode(id) {
    const n = findNode(id);
    if (!n) return;
    pushHistory();
    const copy = JSON.parse(JSON.stringify(n));
    copy.id = uid('n');
    copy.position = { x: n.position.x + 24, y: n.position.y + 24 };
    copy.data.name = n.data.name + ' copy';
    state.nodes.push(copy);
    state.selection = { kind: 'node', id: copy.id };
    state.dirty = true;
    draw();
  }
  function deleteSelection() {
    if (!state.selection) return;
    pushHistory();
    if (state.selection.kind === 'node') {
      const id = state.selection.id;
      state.nodes = state.nodes.filter((n) => n.id !== id);
      state.edges = state.edges.filter((e) => e.source !== id && e.target !== id);
    } else {
      state.edges = state.edges.filter((e) => e.id !== state.selection.id);
    }
    state.selection = null;
    state.dirty = true;
    draw();
  }
  function connect(aId, bId, relationship = 'sync-call') {
    if (aId === bId) return;
    if (state.edges.some((e) => e.source === aId && e.target === bId)) { toast('Connection already exists', 'err'); return; }
    pushHistory();
    state.edges.push({ id: uid('e'), source: aId, target: bId, relationship, label: '' });
    state.dirty = true;
    draw();
  }
  async function saveProject() {
    state.saving = true; draw();
    project.architecture = { nodes: state.nodes, edges: state.edges };
    project.project.updatedAt = new Date().toISOString();
    project.metadata.technologies = [...new Set([...(project.metadata.technologies || []), ...state.nodes.map((n) => n.data.technology).filter(Boolean)])].slice(0, 12);
    try {
      const saved = await api.updateProject(projectId, project);
      state.dirty = false; state.saving = false; state.lastSaved = new Date();
      draw();
      toast('Project saved');
      return saved;
    } catch (e) {
      state.saving = false; draw();
      toast(`Save failed: ${e.message}`, 'err');
      if (e.detail) console.error(e.detail);
    }
  }
  async function runValidation() {
    project.architecture = { nodes: state.nodes, edges: state.edges };
    try {
      const result = await api.validateOnServer(projectId);
      state.issues = result.issues;
      state.inspection = 'issues';
      draw();
      toast(result.errorCount ? `Validation: ${result.errorCount} errors, ${result.warningCount} warnings` : `Validation passed (${result.warningCount} warnings, ${result.infoCount} info)`, result.errorCount ? 'err' : 'ok');
    } catch (e) { toast(`Validation failed: ${e.message}`, 'err'); }
  }
  function autoLayout() {
    if (!state.nodes.length) return;
    pushHistory();
    // simple layered layout: assign levels via longest-path from sources (handles cycles tolerantly)
    const out = new Map(state.nodes.map((n) => [n.id, []]));
    const indeg = new Map(state.nodes.map((n) => [n.id, 0]));
    for (const e of state.edges) { if (out.has(e.source) && indeg.has(e.target)) { out.get(e.source).push(e.target); indeg.set(e.target, indeg.get(e.target) + 1); } }
    let frontier = state.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
    if (!frontier.length) frontier = [state.nodes[0].id];
    const level = new Map();
    frontier.forEach((id) => level.set(id, 0));
    const q = [...frontier];
    const seen = new Set(q);
    while (q.length) {
      const cur = q.shift();
      for (const t of out.get(cur)) {
        if (!seen.has(t)) { level.set(t, (level.get(cur) || 0) + 1); seen.add(t); q.push(t); }
      }
    }
    // cycle nodes not reached: chain them
    let lv = (level.size ? Math.max(...level.values()) : 0) + 1;
    for (const n of state.nodes) if (!level.has(n.id)) level.set(n.id, lv++);
    const byLevel = new Map();
    for (const n of state.nodes) {
      const l = level.get(n.id);
      if (!byLevel.has(l)) byLevel.set(l, []);
      byLevel.get(l).push(n);
    }
    const COL_W = 280, ROW_H = 110;
    for (const [l, arr] of byLevel) {
      arr.forEach((n, i) => {
        n.position = { x: snap(80 + l * COL_W), y: snap(80 + i * ROW_H) };
      });
    }
    state.dirty = true;
    draw();
    toast('Auto-layout applied (Ctrl+S to persist)');
  }

  /* ----- code generation (architecture -> scaffold) ----- */
  function openCodePanel() {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="code-title" style="width:min(1020px,95vw)">
      <div class="eyebrow">CODE GENERATION</div>
      <h2 id="code-title" style="margin:6px 0 4px">Generated scaffold</h2>
      <div id="code-meta" class="muted" style="font-size:12px">Generating…</div>
      <div style="display:grid;grid-template-columns:250px 1fr;gap:12px;margin-top:12px;height:min(52vh,440px)">
        <div id="code-files" style="overflow:auto;border:1px solid var(--border);border-radius:8px;padding:6px"></div>
        <pre id="code-view" style="margin:0;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg);font-family:var(--mono);font-size:11px;line-height:1.55;white-space:pre"></pre>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;align-items:center;flex-wrap:wrap">
        <button class="btn primary" id="code-live-btn" title="Open this service in StackBlitz WebContainers">▶ Open live sandbox</button>
        <button class="btn" id="code-zip">Download ZIP</button>
        <button class="btn" id="code-copy">Copy file</button>
        <button class="btn" id="code-full-btn">Full code view →</button>
        <button class="btn" id="code-close" style="margin-left:auto">Close</button>
      </div>
    </div>`;
    document.body.appendChild(back);
    const metaEl = back.querySelector('#code-meta');
    const listEl = back.querySelector('#code-files');
    const viewEl = back.querySelector('#code-view');
    let current = null;
    const close = () => { back.remove(); window.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.querySelector('#code-close').onclick = close;
    back.onclick = (e) => { if (e.target === back) close(); };
    back.querySelector('#code-zip').onclick = () => window.open(api.exportUrl(projectId, 'zip'), '_blank');
    back.querySelector('#code-full-btn').onclick = () => { close(); navigate(`/code/${projectId}`); };
    let gen = null;
    back.querySelector('#code-live-btn').onclick = () => {
      if (!gen) return toast('Still generating…', 'err');
      const [service] = serviceNames(gen.files);
      openInStackBlitz(project.project.name, service || null, gen.files);
    };
    back.querySelector('#code-copy').onclick = async () => {
      if (!current) return;
      try { await navigator.clipboard.writeText(current.content); toast(`Copied ${current.path}`, 'ok'); }
      catch { toast('Clipboard blocked by the browser', 'err'); }
    };
    window.addEventListener('keydown', onKey);
    (async () => {
      try {
        gen = await api.getCode(projectId);
        if (!gen.files.length) { metaEl.textContent = 'No code could be generated for this architecture.'; return; }
        const skipped = gen.skipped?.length ? ` · ${gen.skipped.length} component(s) without a generator (see TODOs)` : '';
        metaEl.textContent = `${gen.files.length} files · ${(gen.stats.bytes / 1024).toFixed(1)} KB · ${gen.target?.label || 'Node + TypeScript'}${skipped}`;
        const show = (f) => {
          current = f;
          listEl.querySelectorAll('button').forEach((b) => { b.style.background = b.dataset.path === f.path ? 'rgba(139,92,246,.18)' : 'none'; b.style.color = b.dataset.path === f.path ? 'var(--purple-h)' : 'var(--text2)'; });
          viewEl.textContent = f.content;
        };
        for (const f of gen.files) {
          const b = document.createElement('button');
          b.dataset.path = f.path;
          b.textContent = f.path;
          b.title = `${f.path} · ${f.bytes} bytes`;
          b.style.cssText = 'display:block;width:100%;text-align:left;padding:4px 6px;border-radius:4px;font-family:var(--mono);font-size:10.5px;border:0;background:none;color:var(--text2);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
          b.onclick = () => show(f);
          listEl.appendChild(b);
        }
        const first = gen.files.find((f) => /readme/i.test(f.path)) || gen.files[0];
        show(first);
      } catch (e) {
        metaEl.innerHTML = `<span class="form-error" style="display:inline-block">Code generation failed: ${esc(e.message)}</span>`;
      }
    })();
  }

  /* ----- proposal (AI) review & apply ----- */
  function showProposalModal(proposal, meta) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    const fallback = meta.mode === 'demo-fallback';
    const live = meta.mode === 'groq';
    back.innerHTML = `<div class="modal">
      <div class="eyebrow">${live ? 'AI PROPOSAL · GROQ' : fallback ? 'DEMO FALLBACK · PROVIDER UNAVAILABLE' : 'DEMO PROPOSAL (NO MODEL)'}</div>
      <h2 style="margin:6px 0 4px">${live ? `Generated by ${esc(meta.model || 'model')}` : 'Deterministic demo template'}</h2>
      ${meta.warning ? `<div class="form-error" style="display:block;margin:8px 0">${esc(meta.warning)}</div>` : ''}
      <div style="display:flex;gap:14px;margin:10px 0">
        <span class="pill">${proposal.nodes.length} components</span><span class="pill">${proposal.edges.length} connections</span>
        <span class="pill">${esc(proposal.technologies.join(', ') || 'no stack')}</span>
      </div>
      ${proposal.rationale ? `<p class="muted" style="font-size:12px;margin:8px 0"><b>Rationale:</b> ${esc(proposal.rationale)}</p>` : ''}
      ${proposal.assumptions?.length ? `<p class="muted" style="font-size:12px"><b>Assumptions:</b> ${proposal.assumptions.map(esc).join('; ')}</p>` : ''}
      ${proposal.risks?.length ? `<p class="muted" style="font-size:12px"><b>Risks:</b> ${proposal.risks.map(esc).join('; ')}</p>` : ''}
      <div style="margin:12px 0;font-size:12px" class="muted">Preview components:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:130px;overflow:auto">${proposal.nodes.map((n) => `<span class="pill">${esc(n.data.name)}</span>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn primary" id="prop-apply">Apply &amp; generate code</button>
        <button class="btn" id="prop-dismiss">Discard</button>
      </div>
    </div>`;
    document.body.appendChild(back);
    back.querySelector('#prop-dismiss').onclick = () => back.remove();
    back.querySelector('#prop-apply').onclick = () => {
      pushHistory();
      state.nodes = proposal.nodes.map((n) => ({ ...n, position: { ...n.position }, data: { ...n.data, tags: [...(n.data.tags || [])], envVarNames: [...(n.data.envVarNames || [])], endpoints: [...(n.data.endpoints || [])] } }));
      state.edges = proposal.edges.map((e) => ({ ...e }));
      project.metadata.technologies = [...new Set([...(project.metadata.technologies || []), ...proposal.technologies])].slice(0, 12);
      state.selection = null; state.dirty = true;
      back.remove();
      draw();
      toast('Proposal applied — saving…');
      // generate the code scaffold from the newly saved architecture
      saveProject().then((saved) => {
        if (saved) openCodePanel();
        else toast('Architecture not saved — code generation skipped', 'err');
      });
    };
  }
  async function runAiGeneration(promptText) {
    const btn = $('#gen-btn');
    btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const result = await api.generateArchitecture({ prompt: promptText, projectId });
      showProposalModal(result.proposal, { mode: result.mode, model: result.model, warning: result.warning });
      if (result.warning) toast('AI provider unavailable — demo proposal shown', 'err');
    } catch (e) {
      toast(`AI generation failed: ${e.message}`, 'err');
      $('#ai-err')?.remove();
    } finally {
      btn.disabled = false; btn.textContent = '✦ Generate';
    }
  }

  /* ----- editor chrome ----- */
  app.innerHTML = `
    <div class="editor">
      <div class="editor-toolbar">
        <a href="#/projects" class="btn ghost small" title="All projects">←</a>
        <div class="logo-mark" style="width:24px;height:24px;font-size:11px">A2</div>
        <input id="proj-name" value="${esc(project.project.name)}" style="width:230px;padding:4px 8px;font-size:13px" title="Project name (persisted on save)">
        <span class="pill" id="proj-status">${esc(project.project.status)}</span>
        <div class="spacer" style="flex:1"></div>
        <button class="tb-btn" id="undo-btn" title="Undo (Ctrl+Z)">↶ Undo</button>
        <button class="tb-btn" id="redo-btn" title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
        <span style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2)"><span class="save-dot saved" id="save-dot"></span><span id="save-label">Saved</span></span>
        <button class="tb-btn" id="validate-btn">✔ Validate</button>
        <button class="tb-btn" id="layout-btn">⇄ Auto-layout</button>
        <button class="tb-btn" id="fit-btn">⤢ Fit</button>
        <button class="tb-btn" id="exp-menu-btn">⇩ Export</button>
        <button class="tb-btn" id="code-btn" title="Generate the Node + TypeScript scaffold from this architecture">⌘ Code</button>
        <button class="tb-btn primary" id="gen-btn">✦ Generate</button>
        <a class="tb-btn" href="#/docs" title="Docs">?</a>
      </div>
      <div class="editor-body">
        <div class="palette" id="palette"><input placeholder="Search components…" id="pal-search"><div id="pal-list"></div></div>
        <div class="canvas-wrap" id="cv-wrap">
          <div id="cv-wrap-inner" style="position:absolute;inset:0"></div>
          <div style="position:absolute;bottom:10px;right:10px;display:flex;gap:6px">
            <button class="btn small" id="zoom-out">−</button><span class="pill mono" id="zoom-lbl">100%</span><button class="btn small" id="zoom-in">＋</button>
          </div>
          <div style="position:absolute;top:10px;right:10px;background:rgba(13,14,21,.85);border:1px solid var(--border);border-radius:8px;padding:6px" id="minimap"></div>
        </div>
        <div class="inspector" id="inspector"></div>
      </div>
      <div class="bottom-panel" id="issues"></div>
    </div>`;
  $('#proj-name').onchange = (e) => { project.project.name = e.target.value.trim() || project.project.name; state.dirty = true; draw(); };

  /* palette */
  function drawPalette(filter = '') {
    const cats = new Map();
    for (const [key, c] of Object.entries(CATALOG)) {
      if (filter && !(key.includes(filter.toLowerCase()) || c.label.toLowerCase().includes(filter.toLowerCase()))) continue;
      if (!cats.has(c.category)) cats.set(c.category, []);
      cats.get(c.category).push([key, c]);
    }
    $('#pal-list').innerHTML = [...cats.entries()].map(([cat, items]) => `
      <div class="pal-cat">${esc(cat)}</div>
      ${items.map(([k, c]) => `<div class="pal-item" data-type="${k}" draggable="true" title="${esc(c.label)}"><span>${c.icon}</span><span>${esc(c.label)}</span></div>`).join('')}`).join('');
    $('#pal-list').querySelectorAll('.pal-item').forEach((el) => {
      el.onclick = () => {
        const wrap = $('#cv-wrap');
        addNode(el.dataset.type, { x: wrap.clientWidth / 2 / state.zoom - state.pan.x / state.zoom, y: wrap.clientHeight / 2 / state.zoom - state.pan.y / state.zoom });
      };
      el.ondragstart = (e) => e.dataTransfer.setData('text/a2c-type', el.dataset.type);
    });
  }
  drawPalette();
  $('#pal-search').oninput = (e) => drawPalette(e.target.value);

  /* canvas events */
  let drag = null; // {kind:'node'|'pan', ...}
  const wrapEl = $('#cv-wrap');
  bindCanvas();
  function bindCanvas() {
    $('#cv-wrap-inner').addEventListener('mousedown', onDown);
    $('#cv-wrap-inner').addEventListener('mousemove', onMove);
    window.addEventListener('mousemove', onMove);
    $('#cv-wrap-inner').addEventListener('mouseup', onUp);
    window.addEventListener('mouseup', onUp);
    wrapEl.addEventListener('wheel', onWheel, { passive: false });
    $('#cv-wrap-inner').addEventListener('dragover', (e) => e.preventDefault());
    $('#cv-wrap-inner').addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/a2c-type');
      if (type) addNode(type, canvasPoint(e));
    });
    $('#cv-wrap-inner').addEventListener('click', onClick);
  }
  function svgPointFromEvent(evt) {
    const r = $('#cv').getBoundingClientRect();
    return { x: (evt.clientX - r.left - state.pan.x) / state.zoom, y: (evt.clientY - r.top - state.pan.y) / state.zoom };
  }
  function onDown(e) {
    if (e.button !== 0) return;
    const pt = svgPointFromEvent(e);
    const handle = hitHandleFromEvent(e);
    if (handle) {
      state.pendingConnect = { fromId: handle.id, from: { x: handle.position.x + N_W, y: handle.position.y + N_H / 2 } };
      draw();
      return;
    }
    const n = nodeAt(pt);
    if (n) {
      state.selection = { kind: 'node', id: n.id };
      drag = { kind: 'node', id: n.id, dx: pt.x - n.position.x, dy: pt.y - n.position.y, moved: false, startSnap: snapshot() };
      draw();
    } else {
      const e2 = edgeAt(pt);
      if (e2) { state.selection = { kind: 'edge', id: e2.id }; draw(); }
      else { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: state.pan.x, py: state.pan.y, startSel: state.selection }; }
    }
  }
  function hitHandleFromEvent(e) {
    const pt = svgPointFromEvent(e);
    const hN = nodeAt(pt) ? nodeAt(pt) : null;
    if (hN) {
      const hx = hN.position.x + N_W, hy = hN.position.y + N_H / 2;
      if (Math.hypot(pt.x - hx, pt.y - hy) < 12) return hN;
    }
    return null;
  }
  function onMove(e) {
    if (state.pendingConnect) {
      const pt = svgPointFromEvent(e);
      state.mouse = pt;
      draw();
      return;
    }
    if (!drag) return;
    if (drag.kind === 'pan') {
      state.pan.x = drag.px + (e.clientX - drag.sx);
      state.pan.y = drag.py + (e.clientY - drag.sy);
      $('#cv-wrap-inner').firstElementChild && ($('#cv-wrap-inner').firstElementChild.querySelector('#world') || {}).setAttribute?.('transform', `translate(${state.pan.x},${state.pan.y}) scale(${state.zoom})`);
      draw();
      return;
    }
    const pt = svgPointFromEvent(e);
    const n = findNode(drag.id);
    if (!n) return;
    const nx = pt.x - drag.dx, ny = pt.y - drag.dy;
    if (Math.abs(nx - n.position.x) + Math.abs(ny - n.position.y) > 2) drag.moved = true;
    n.position = { x: snap(nx), y: snap(ny) };
    state.dirty = true;
    draw();
  }
  function onUp(e) {
    if (state.pendingConnect) {
      const pt = svgPointFromEvent(e);
      const target = nodeAt(pt);
      if (target && target.id !== state.pendingConnect.fromId) {
        connect(state.pendingConnect.fromId, target.id);
      } else {
        // dropped on empty space: snap the source handle back (optional visual)
      }
      state.pendingConnect = null;
      draw();
    } else if (drag && drag.kind === 'node' && drag.moved) {
      pushHistory();
    }
    drag = null;
  }
  function onClick(e) {
    if (state.pendingConnect) {
      const pt = svgPointFromEvent(e);
      const n = nodeAt(pt);
      if (n && n.id !== state.pendingConnect.fromId) {
        connect(state.pendingConnect.fromId, n.id);
      }
      state.pendingConnect = null;
      draw();
      return;
    }
    const pt = svgPointFromEvent(e);
    if (!nodeAt(pt) && !edgeAt(pt)) {
      if (state.selection) { state.selection = null; draw(); }
    }
  }
  function onWheel(e) {
    e.preventDefault();
    const rect = wrapEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nz = Math.min(2.5, Math.max(0.3, state.zoom * factor));
    state.pan.x = mx - ((mx - state.pan.x) / state.zoom) * nz;
    state.pan.y = my - ((my - state.pan.y) / state.zoom) * nz;
    state.zoom = nz;
    $('#zoom-lbl').textContent = `${Math.round(state.zoom * 100)}%`;
    draw();
  }
  function fitView() {
    if (!state.nodes.length) { state.pan = { x: 60, y: 60 }; state.zoom = 1; draw(); return; }
    const xs = state.nodes.map((n) => n.position.x), ys = state.nodes.map((n) => n.position.y);
    const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + N_W + 40, maxY = Math.max(...ys) + N_H + 40;
    const vw = wrapEl.clientWidth, vh = wrapEl.clientHeight;
    state.zoom = Math.min(2.5, Math.max(0.3, Math.min(vw / (maxX - minX), vh / (maxY - minY))));
    state.pan.x = (vw - (maxX - minX) * state.zoom) / 2 - minX * state.zoom;
    state.pan.y = (vh - (maxY - minY) * state.zoom) / 2 - minY * state.zoom;
    $('#zoom-lbl').textContent = `${Math.round(state.zoom * 100)}%`;
    draw();
  }

  /* toolbar bindings */
  $('#undo-btn').onclick = undo;
  $('#redo-btn').onclick = redo;
  $('#validate-btn').onclick = () => busy($('#validate-btn'), runValidation);
  $('#layout-btn').onclick = autoLayout;
  $('#fit-btn').onclick = fitView;
  function openGenerateDialog() {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="ai-dlg-title">
      <div class="eyebrow">AI GENERATION</div>
      <h2 id="ai-dlg-title" style="margin:6px 0 4px">Describe your system</h2>
      <p class="muted" style="font-size:12px;margin:0 0 12px">List your frontend, services, data stores and how they talk. Groq turns it into a component graph you can edit.</p>
      <div class="field">
        <label for="ai-prompt">What are you building?</label>
        <textarea id="ai-prompt" rows="5" maxlength="2000" placeholder="E-commerce platform with a React storefront, Node order and catalog services, Kafka order events, PostgreSQL, and a Redis cache">${esc(project.project.description || '')}</textarea>
      </div>
      <div class="form-error" id="ai-err" style="display:none"></div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn primary" id="ai-go">Generate architecture</button>
        <button class="btn" id="ai-cancel">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(back);
    const ta = back.querySelector('#ai-prompt');
    const err = back.querySelector('#ai-err');
    const close = () => { back.remove(); window.removeEventListener('keydown', onKey); };
    const submit = () => {
      const text = ta.value.trim();
      if (text.length < 10) {
        err.textContent = 'Please describe the system in at least 10 characters.';
        err.style.display = 'block';
        ta.focus();
        return;
      }
      close();
      runAiGeneration(text);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.querySelector('#ai-go').onclick = submit;
    back.querySelector('#ai-cancel').onclick = close;
    back.onclick = (e) => { if (e.target === back) close(); };
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(); });
    window.addEventListener('keydown', onKey);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  $('#gen-btn').onclick = openGenerateDialog;
  $('#zoom-in').onclick = () => { state.zoom = Math.min(2.5, state.zoom * 1.15); $('#zoom-lbl').textContent = `${Math.round(state.zoom * 100)}%`; draw(); };
  $('#zoom-out').onclick = () => { state.zoom = Math.max(0.3, state.zoom / 1.15); $('#zoom-lbl').textContent = `${Math.round(state.zoom * 100)}%`; draw(); };
  $('#code-btn').onclick = openCodePanel;
  $('#exp-menu-btn').onclick = (e) => {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.style.cssText = 'position:fixed;top:52px;right:150px';
    menu.innerHTML = `
      <button data-f="json">Architecture JSON</button>
      <button data-f="mermaid">Mermaid diagram (.mmd)</button>
      <button data-f="validation-report">Validation report</button>
      <button data-f="zip">Code scaffold ZIP</button>
      <button data-f="__import" style="border-top:1px solid var(--border)">⇧ Import Mermaid…</button>`;
    document.body.appendChild(menu);
    menu.onclick = (ev) => {
      const f = ev.target.dataset.f;
      menu.remove();
      if (!f) return;
      if (f === '__import') return openMermaidImport();
      if (f === 'json') { downloadJSON(project, `${slug(project.project.name)}.arch2code.json`); }
      else window.open(api.exportUrl(projectId, f), '_blank');
    };
  };
  /* ----- Mermaid import (paste or drop into the editor) ----- */
  function openMermaidImport() {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" style="max-width:640px">
      <div class="eyebrow">IMPORT · MERMAID FLOWCHART</div>
      <h2 style="margin:6px 0 4px">Bring an existing diagram in</h2>
      <p class="muted" style="font-size:12px;margin:6px 0 10px">Paste Mermaid flowchart text (<code class="mono">flowchart LR</code> / <code class="mono">graph TD</code>). Nodes, shapes, labels and arrows become editable components and connections; component types are inferred from labels and can be changed in the inspector.</p>
      <div class="form-error" id="mm-err" hidden></div>
      <textarea id="mm-text" placeholder="flowchart LR&#10;  web[Web App] --> gw(API Gateway)&#10;  gw --> api[Order Service]&#10;  api --> db[(PostgreSQL)]" style="width:100%;min-height:210px;font-family:var(--mono);font-size:12px;resize:vertical"></textarea>
      <div style="display:flex;align-items:center;gap:8px;margin:12px 0">
        <label style="font-size:12px;color:var(--text2)">Apply as</label>
        <select id="mm-mode" style="width:auto"><option value="replace">Replace current architecture</option><option value="merge">Merge into current architecture</option></select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn primary" id="mm-run">Import diagram</button>
        <button class="btn" id="mm-cancel">Cancel</button>
      </div>
      <p class="muted" style="font-size:11px;margin-top:10px">Tip: <b>⇩ Export → Mermaid diagram</b> gives you a compatible starting file. Edges keep their relationship type where the arrow style encodes it (<code class="mono">-.-&gt;</code> async, <code class="mono">==&gt;</code> data write).</p>
    </div>`;
    document.body.appendChild(back);
    back.querySelector('#mm-cancel').onclick = () => back.remove();
    back.querySelector('#mm-run').onclick = async () => {
      const btn = back.querySelector('#mm-run');
      const errEl = back.querySelector('#mm-err');
      const ta = back.querySelector('#mm-text');
      errEl.hidden = true;
      if (!ta.value.trim()) { errEl.textContent = 'Paste some Mermaid text first.'; errEl.hidden = false; return; }
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Importing…';
      try {
        const res = await api.importMermaid(projectId, { text: ta.value, mode: back.querySelector('#mm-mode').value });
        pushHistory();
        state.nodes = res.project.architecture.nodes.map((n) => ({ ...n, position: { ...n.position }, data: { ...n.data, tags: [...(n.data.tags || [])], envVarNames: [...(n.data.envVarNames || [])], endpoints: [...(n.data.endpoints || [])] } }));
        state.edges = res.project.architecture.edges.map((e) => ({ ...e }));
        project.metadata = res.project.metadata || project.metadata;
        state.selection = null; state.dirty = false;
        lastSnapshot = snapshot();
        back.remove();
        fitView(); draw();
        toast(`Imported ${res.stats.nodes} components, ${res.stats.edges} connections`);
        if (res.warnings?.length) setTimeout(() => toast(res.warnings[0], 'err'), 1200);
        runValidation();
      } catch (e) {
        const detail = Array.isArray(e.detail) ? ` (${e.detail.map((d) => d.issue || d).slice(0, 2).join('; ')})` : '';
        errEl.textContent = `${e.message}${detail}`;
        errEl.hidden = false;
        btn.disabled = false; btn.textContent = 'Import diagram';
      }
    };
  }

  const keyDown = (e) => {
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !inInput) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') && !inInput) { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput && state.selection) { e.preventDefault(); deleteSelection(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && state.selection?.kind === 'node' && !inInput) { e.preventDefault(); duplicateNode(state.selection.id); }
    else if (e.key === 'Escape') { state.selection = null; state.pendingConnect = null; draw(); }
  };
  window.addEventListener('keydown', keyDown);
  // cleanup on navigation
  const cleanNav = () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('hashchange', cleanNav); };
  window.addEventListener('hashchange', cleanNav);

  /* uploads & import & session AI */
  const pendingAI = sessionStorage.getItem('a2c.pendingAI');
  if (pendingAI && query.get('ai') === '1') {
    sessionStorage.removeItem('a2c.pendingAI');
    const payload = JSON.parse(pendingAI);
    toast('Generating architecture proposal…');
    setTimeout(() => runAiGeneration(payload.prompt), 300);
  }
  const uploadedNote = sessionStorage.getItem('a2c.uploadedFile');
  if (uploadedNote) {
    sessionStorage.removeItem('a2c.uploadedFile');
    const f = JSON.parse(uploadedNote);
    toast(`Attached ${f.name}. ${f.note}`, 'ok');
  }

  // initial render
  state.issues = [];
  fitView();
  // validate once so the panel starts populated
  runValidation();
}

/* export helper */
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'download.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function slug(s) { return String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'; }

/* ---------- 6. routes ---------- */
route('/', landingPage);
route('/auth', authPage);
route('/dashboard', dashboardPage);
route('/projects', projectsPage);
route('/projects/new', newProjectPage);
route('/editor/:projectId', editorPage);
route('/code', codePage);
route('/code/:projectId', codePage);
route('/templates', templatesPage);
route('/generations', generationsPage);
route('/docs', docsPage);
route('/settings', settingsPage);

/* ---------- 7. boot ---------- */
if (!location.hash) location.hash = '#/';
render();
