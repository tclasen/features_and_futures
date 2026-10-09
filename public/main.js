// Client-side code for Workboard application

const API_BASE = '/api';

function $(sel) {
  return document.querySelector(sel);
}

function createEl(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('data-')) el.setAttribute(k, v);
    else el[k] = v;
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

async function fetchJson(url, opts = {}) {
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw data;
  return data;
}

function showAlert(msg) {
  // Simple visible alert using window.alert (acceptable for visibility)
  alert(msg);
}

async function renderProjectList() {
  const list = $('#project-list');
  list.innerHTML = '';
  const projects = await fetchJson(`${API_BASE}/projects`);
  for (const p of projects) {
    const row = createEl('div', { 'data-testid': 'project-row', class: 'project-row' },
      createEl('span', {}, p.name),
      createEl('button', { class: 'open-btn' }, 'Open project')
    );
    row.querySelector('.open-btn').addEventListener('click', () => {
      window.location.href = `/projects/${p.id}`;
    });
    list.appendChild(row);
  }
}

async function loadProjectsPage() {
  const app = $('#app');
  app.innerHTML = '';
  const heading = createEl('h1', {}, 'Workboard');
  const form = createEl('div', {},
    createEl('label', { for: 'project-name' }, 'Project name'),
    createEl('input', { type: 'text', id: 'project-name' }),
    createEl('button', { id: 'create-btn' }, 'Create project')
  );
  const listContainer = createEl('div', { id: 'project-list' });
  app.append(heading, form, listContainer);

  $('#create-btn').addEventListener('click', async () => {
    const nameInput = $('#project-name');
    const name = nameInput.value.trim();
    try {
      await fetchJson(`${API_BASE}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      nameInput.value = '';
      await renderProjectList();
    } catch (e) {
      if (e.error) showAlert(e.error);
      else showAlert('Failed to create project');
    }
  });

  await renderProjectList();
}

async function loadProjectDetailPage(id) {
  const app = $('#app');
  app.innerHTML = '';
  const proj = await fetchJson(`${API_BASE}/projects/${id}`);
  const heading = createEl('h1', {}, proj.name);
  const backBtn = createEl('button', {}, 'Projects');
  backBtn.addEventListener('click', () => {
    window.location.href = '/';
  });
  app.append(heading, backBtn);
}

function router() {
  const path = window.location.pathname;
  if (path === '/' || path === '/index.html') {
    loadProjectsPage();
  } else if (path.startsWith('/projects/')) {
    const id = path.split('/').pop();
    loadProjectDetailPage(id);
  } else {
    loadProjectsPage();
  }
}

window.addEventListener('load', router);
window.addEventListener('popstate', router);
