const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load projects');
  return body;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function projectsButton() {
  const button = element('button', 'Projects', { type: 'button' });
  button.addEventListener('click', () => { window.location.href = '/'; });
  return button;
}

function projectRow(project) {
  const row = element('li', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  const name = element('span', project.name, { class: 'project-name' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
  return row;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.replaceChildren(projectsButton());
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.append(element('h1', project.name));
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      app.append(element('p', error.message, { role: 'alert' }));
    }
    app.setAttribute('aria-busy', 'false');
    return;
  }

  const heading = element('h1', 'Workboard');
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', '', { role: 'alert', class: 'alert', hidden: '' });
  const list = element('ul', undefined, { class: 'projects', 'aria-label': 'Projects' });
  const empty = element('p', 'No projects yet. Create your first project above.', { class: 'empty' });
  form.append(label, input, submit);
  app.replaceChildren(heading, form, alert, list, empty);

  const showError = message => {
    alert.textContent = message;
    alert.hidden = false;
  };

  // Wait for the initial list so new rows always follow existing projects.
  submit.disabled = true;
  try {
    const projects = await request('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
    empty.hidden = projects.length > 0;
  } catch (error) {
    showError(error.message);
  }
  submit.disabled = false;
  app.setAttribute('aria-busy', 'false');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    submit.disabled = true;
    alert.hidden = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      empty.hidden = true;
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

render();
