/* Arch2Code AI — API client. All server communication lives here. */
window.api = (function () {
  async function req(method, url, body, raw) {
    const res = await fetch(url, {
      method,
      headers: body && !raw ? { 'Content-Type': 'application/json' } : {},
      body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    });
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await res.json().catch(() => null);
    else data = await res.text().catch(() => '');
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.detail = data && data.detail;
      throw err;
    }
    return data;
  }
  return {
    health: () => req('GET', '/api/health'),
    listProjects: () => req('GET', '/api/projects'),
    getProject: (id) => req('GET', `/api/projects/${id}`),
    createProject: (payload) => req('POST', '/api/projects', payload),
    updateProject: (id, project) => req('PUT', `/api/projects/${id}`, project),
    deleteProject: (id) => req('DELETE', `/api/projects/${id}`),
    validateProject: (id) => req('POST', `/api/projects/${id}/validate`, {}),
    exportJson: async (id) => {
      const res = await fetch(`/api/projects/${id}/export`);
      if (!res.ok) throw new Error('export failed');
      return res.json();
    },
    exportUrl: (id, fmt) => `/api/projects/${id}/export${fmt ? `?format=${fmt}` : ''}`,
    getCode: (id) => req('GET', `/api/projects/${id}/code`),
    importMermaid: (id, payload) => req('POST', `/api/projects/${id}/import/mermaid`, payload),
    validateOnServer: (id) => req('POST', `/api/projects/${id}/validate`, {}),
    listGenerations: () => req('GET', '/api/generations'),
    generateArchitecture: (payload) => req('POST', '/api/ai/generate', payload),
    templates: () => req('GET', '/api/templates'),
  };
})();
