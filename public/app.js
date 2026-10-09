const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete request');
  return result;
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function showError(message) {
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
  const open = element('button', 'Open project');
  open.type = 'button';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
  row.append(element('span', project.name), open);
  return row;
}

async function showProjects() {
  const projects = await api('/api/projects');
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
  list.setAttribute('aria-label', 'Projects');
  list.append(...projects.map(projectRow));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value.trim()) {
      showError('Project name is required');
      return;
    }
    create.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      list.append(projectRow(project));
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      create.disabled = false;
    }
  });
  app.append(form, list);
}

async function showProject(id) {
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.replaceChildren(back);
  const project = await api(`/api/projects/${id}`);
  app.prepend(element('h1', project.name));
  document.title = `${project.name} · Workboard`;
}

try {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  showError(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
