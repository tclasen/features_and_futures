const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load projects');
  return body;
}

function alertMessage(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project) {
  const row = element('li');
  row.dataset.testid = 'project-row';
  row.append(element('span', project.name));
  const open = element('button', 'Open project');
  open.type = 'button';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
  row.append(open);
  return row;
}

async function showProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const create = element('button', 'Create project');
  create.type = 'submit';
  form.append(label, input, create);
  const list = element('ul');
  list.className = 'projects';
  list.setAttribute('aria-label', 'Projects');
  app.append(form, list);
  const projects = await request('/api/projects');
  list.replaceChildren(...projects.map(projectRow));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value.trim()) {
      alertMessage('Project name is required');
      return;
    }
    create.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      list.append(projectRow(project));
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      alertMessage(error.message);
    } finally {
      create.disabled = false;
    }
  });
}

async function showProject(id) {
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.replaceChildren(back);
  const project = await request(`/api/projects/${id}`);
  app.prepend(element('h1', project.name));
  document.title = `${project.name} — Workboard`;
}

try {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  alertMessage(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
