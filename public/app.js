const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project) {
  const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
  const button = element('button', 'Open project', { type: 'button' });
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), button);
  return row;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const project = await request(`/api/projects/${match[1]}`);
    app.prepend(element('h1', project.name));
    document.title = `${project.name} — Workboard`;
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, submit);
  const list = element('section', '', { 'aria-label': 'Projects' });
  app.append(form, list);
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
      app.querySelector('[role="alert"]')?.remove();
      list.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  submit.disabled = true;
  try {
    for (const project of await request('/api/projects')) list.append(projectRow(project));
  } finally {
    submit.disabled = false;
  }
}

render().catch((error) => showError(error.message)).finally(() => app.setAttribute('aria-busy', 'false'));
