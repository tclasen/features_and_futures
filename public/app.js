const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function showAlert(message) {
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

async function renderList() {
  app.append(element('h1', 'Workboard'));
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

  // Load before enabling creation so new rows cannot race the initial list.
  create.disabled = true;
  const projects = await api('/api/projects');
  list.append(...projects.map(projectRow));
  create.disabled = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const name = input.value.trim();
    if (!name) {
      showAlert('Project name is required');
      return;
    }
    create.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      create.disabled = false;
    }
  });
}

async function renderProject(id) {
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  const project = await api(`/api/projects/${id}`);
  app.prepend(element('h1', project.name));
  document.title = `${project.name} · Workboard`;
}

try {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await renderProject(match[1]);
  else await renderList();
} catch (error) {
  showAlert(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
