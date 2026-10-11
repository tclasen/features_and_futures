const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.testId) node.dataset.testid = options.testId;
  return node;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

async function showProject(projectId) {
  const projects = await loadProjects();
  const project = projects.find((item) => String(item.id) === projectId);
  if (!project) {
    history.replaceState(null, '', '/');
    await render();
    return;
  }

  app.replaceChildren();
  const back = element('button', { text: 'Projects', className: 'back-button' });
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, element('h1', { text: project.name }));
}

async function showProjects() {
  app.replaceChildren();
  app.append(element('h1', { text: 'Workboard' }));

  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);

  const form = element('form');
  const label = element('label', { text: 'Project name' });
  const input = element('input');
  input.type = 'text';
  input.name = 'projectName';
  label.append(input);
  const create = element('button', { text: 'Create project' });
  create.type = 'submit';
  form.append(label, create);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      alert.textContent = 'Could not create project';
      alert.hidden = false;
      return;
    }
    await render();
  });
  app.append(form);

  const projects = await loadProjects();
  for (const project of projects) {
    const row = element('div', { className: 'project-row', testId: 'project-row' });
    row.append(element('span', { text: project.name, className: 'project-name' }));
    const open = element('button', { text: 'Open project' });
    open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(open);
    app.append(row);
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
}

render().catch(() => {
  app.replaceChildren(element('p', { text: 'Workboard could not be loaded.' }));
});
