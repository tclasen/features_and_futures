const app = document.querySelector('#app');

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function showError(message) {
  const alert = element('p', message, { role: 'alert' });
  app.prepend(alert);
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, submit);
  app.append(form);
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  app.append(list);
  try {
    const projects = await getProjects();
    for (const project of projects) {
      const row = element('article', undefined, { 'data-testid': 'project-row', class: 'project-row' });
      row.append(element('span', project.name));
      const open = element('button', 'Open project', { type: 'button' });
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(open);
      list.append(row);
    }
  } catch {
    showError('Could not load projects');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      return;
    }
    try {
      const response = await fetch('/api/projects', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Could not create project');
      renderList();
    } catch {
      showError('Could not create project');
    }
  });
}

async function renderProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back);
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error('Project not found');
    const project = await response.json();
    app.append(element('h1', project.name));
  } catch {
    app.append(element('h1', 'Project not found'));
  }
}

const match = location.pathname.match(/^\/projects\/(\d+)$/);
if (match) renderProject(match[1]);
else renderList();
