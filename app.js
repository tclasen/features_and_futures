const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = document.createElement('form');
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  input.setAttribute('aria-label', 'Project name');
  form.append(input, element('button', 'Create project', { type: 'submit' }));
  const error = element('p', '', { id: 'error', role: 'alert', hidden: '' });
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
      input.value = '';
      await populateProjects(list);
    } catch (cause) {
      error.textContent = cause.message;
      error.hidden = false;
    }
  });
  app.append(form, error, list);
  await populateProjects(list);
}

async function populateProjects(list) {
  const projects = await request('/api/projects');
  list.replaceChildren(...projects.map(project => {
    const row = element('div', undefined, { 'data-testid': 'project-row' });
    row.append(element('span', project.name), element('button', 'Open project', { type: 'button' }));
    row.querySelector('button').addEventListener('click', () => { location.href = `/projects/${encodeURIComponent(project.id)}`; });
    return row;
  }));
}

async function renderProject(id) {
  const project = await request('/api/projects').then(projects => projects.find(item => String(item.id) === id));
  if (!project) { location.replace('/'); return; }
  app.replaceChildren(element('button', 'Projects', { type: 'button' }), element('h1', project.name));
  app.querySelector('button').addEventListener('click', () => { location.href = '/'; });
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) renderProject(match[1]).catch(() => { location.replace('/'); });
else renderList().catch(() => { app.textContent = 'Unable to load projects.'; });
