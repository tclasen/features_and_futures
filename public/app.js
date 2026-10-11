const app = document.querySelector('#app');

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

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function projectsButton() {
  const button = element('button', 'Projects');
  button.type = 'button';
  button.addEventListener('click', () => location.assign('/'));
  return button;
}

function projectRow(project) {
  const row = element('li');
  row.dataset.testid = 'project-row';
  const button = element('button', 'Open project');
  button.type = 'button';
  button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  row.append(element('span', project.name), button);
  return row;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.append(projectsButton());
    const project = await request(`/api/projects/${match[1]}`);
    document.title = `${project.name} · Workboard`;
    app.append(element('h1', project.name));
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
  form.append(label, input, submit);
  const list = element('ul');
  list.setAttribute('aria-label', 'Projects');
  app.append(form, list);
  const projects = await request('/api/projects');
  projects.forEach(project => list.append(projectRow(project)));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!input.value.trim()) {
      showError('Project name is required');
      return;
    }
    submit.disabled = true;
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
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

render().catch(error => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
