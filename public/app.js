const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function projectsButton() {
  const button = element('button', 'Projects', { type: 'button', class: 'secondary' });
  button.addEventListener('click', () => { window.location.href = '/'; });
  return button;
}

function projectRow(project) {
  const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
  const name = element('span', project.name, { class: 'project-name' });
  const button = element('button', 'Open project', { type: 'button', class: 'secondary' });
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, button);
  return row;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  app.replaceChildren();
  if (match) {
    app.append(projectsButton());
    const project = await api(`/api/projects/${match[1]}`);
    app.append(element('h1', project.name));
    document.title = `${project.name} · Workboard`;
    return;
  }
  app.append(element('h1', 'Workboard'), element('p', 'A home for your projects.', { class: 'subtitle' }));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create project', { type: 'submit' });
  const fields = element('div', '', { class: 'fields' });
  fields.append(input, create);
  const alert = element('p', '', { role: 'alert', hidden: '' });
  form.append(label, fields, alert);
  const list = element('section', '', { 'aria-label': 'Projects', class: 'projects' });
  const empty = element('p', 'No projects yet. Create your first project above.', { class: 'empty' });
  app.append(form, list);
  const projects = await api('/api/projects');
  list.append(...projects.map(projectRow));
  if (!projects.length) list.append(empty);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      empty.remove();
      list.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    } finally {
      create.disabled = false;
    }
  });
}

render().catch((error) => {
  app.append(element('p', error.message, { role: 'alert' }));
}).finally(() => app.setAttribute('aria-busy', 'false'));
