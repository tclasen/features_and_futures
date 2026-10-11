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

function projectRow(project) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  row.append(element('span', project.name, { class: 'project-name' }));
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => {
    history.pushState({}, '', `/projects/${project.id}`);
    renderProject(project.id);
  });
  row.append(open);
  return row;
}

async function renderList() {
  app.replaceChildren();
  app.append(element('h1', 'Workboard'));

  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Project name', autocomplete: 'off' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(input, submit);
  const alert = element('p', '', { id: 'alert', role: 'alert', hidden: '' });
  const projects = element('section', undefined, { id: 'projects', 'aria-label': 'Projects' });
  app.append(form, alert, projects);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    alert.textContent = '';
    alert.hidden = true;
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const project = await response.json();
    input.value = '';
    projects.append(projectRow(project));
  });

  for (const project of await loadProjects()) {
    projects.append(projectRow(project));
  }
}

async function renderProject(id) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) {
    history.replaceState({}, '', '/');
    return renderList();
  }
  const project = await response.json();
  const view = element('section', undefined, { id: 'project-view' });
  view.append(element('h1', project.name));
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => {
    history.pushState({}, '', '/');
    renderList();
  });
  view.append(back);
  app.replaceChildren(view);
}

function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  return match ? renderProject(match[1]) : renderList();
}

window.addEventListener('popstate', renderRoute);
renderRoute();
