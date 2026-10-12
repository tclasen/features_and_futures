const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', undefined, { role: 'alert', class: 'alert' });
    app.querySelector('form').after(alert);
  }
  alert.textContent = message;
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Project name', name: 'name' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(input, create);
  app.append(form);
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  app.append(list);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const error = await response.json();
      showError(error.error || 'Could not create project');
      return;
    }
    const project = await response.json();
    input.value = '';
    app.querySelector('[role="alert"]')?.remove();
    list.append(projectRow(project));
  });
  const projects = await loadProjects();
  for (const project of projects) list.append(projectRow(project));
}

function projectRow(project) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  row.append(element('span', project.name));
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${encodeURIComponent(project.id)}`; });
  row.append(open);
  return row;
}

async function renderProject(id) {
  const projects = await loadProjects();
  const project = projects.find(item => String(item.id) === id);
  if (!project) {
    app.append(element('h1', 'Project not found'));
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    return;
  }
  app.append(element('h1', project.name));
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
}

const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) renderProject(decodeURIComponent(match[1])).catch(() => showError('Could not load project'));
else renderList().catch(() => showError('Could not load projects'));
