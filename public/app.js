const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
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
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), open);
  return row;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const project = await request(`/api/projects/${match[1]}`);
    app.append(element('h1', project.name));
    document.title = `${project.name} · Workboard`;
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  submit.disabled = true;
  const list = element('ul');
  list.setAttribute('aria-label', 'Projects');
  form.append(label, input, submit);
  app.append(form, list);
  const projects = await request('/api/projects');
  list.append(...projects.map(projectRow));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showError('Project name is required');
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  submit.disabled = false;
}

render().catch((error) => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
