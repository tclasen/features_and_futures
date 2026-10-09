const app = document.querySelector('#app');

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function heading(text) {
  const h = document.createElement('h1');
  h.textContent = text;
  return h;
}

async function showList() {
  app.replaceChildren(heading('Workboard'));
  const panel = document.createElement('section');
  panel.className = 'panel';
  const form = document.createElement('form');
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  field.append(label, input);
  const create = document.createElement('button');
  create.type = 'submit';
  create.textContent = 'Create project';
  form.append(field, create);
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    alert.hidden = true;
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const error = await response.json();
      alert.textContent = error.error || 'Could not create project';
      alert.hidden = false;
      return;
    }
    input.value = '';
    await render();
  });
  const rows = document.createElement('div');
  rows.className = 'rows';
  const projects = await getProjects();
  if (!projects.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No projects yet.';
    rows.append(empty);
  }
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(name, open);
    rows.append(row);
  }
  panel.append(form, alert, rows);
  app.append(panel);
}

async function showProject(id) {
  const projects = await getProjects();
  const project = projects.find(item => String(item.id) === id);
  if (!project) {
    app.replaceChildren(heading('Project not found'));
    return;
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'back';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { location.href = '/'; });
  app.replaceChildren(back, heading(project.name));
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (match) await showProject(decodeURIComponent(match[1]));
  else await showList();
}

render().catch(() => {
  app.replaceChildren(heading('Workboard'), Object.assign(document.createElement('p'), { textContent: 'Unable to load Workboard.' }));
});
