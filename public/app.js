const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load projects');
  return result;
}

function projectRow(project) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), open);
  return row;
}

async function render() {
  app.replaceChildren();
  const projectId = window.location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (projectId) {
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const project = await api(`/api/projects/${projectId}`);
    document.title = `${project.name} · Workboard`;
    app.append(element('h1', project.name));
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create project', { type: 'submit', class: 'primary' });
  create.disabled = true;
  const controls = element('div', undefined, { class: 'controls' });
  controls.append(input, create);
  const alert = element('p', '', { role: 'alert', class: 'alert' });
  alert.hidden = true;
  form.append(label, controls, alert);
  const list = element('section', undefined, { 'aria-label': 'Projects', class: 'project-list' });
  app.append(form, list);
  const projects = await api('/api/projects');
  const empty = element('p', 'No projects yet. Create a project to get started.', { class: 'empty' });
  list.append(...(projects.length ? projects.map(projectRow) : [empty]));

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
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
  create.disabled = false;
}

render().catch((error) => {
  app.append(element('p', error.message, { role: 'alert', class: 'alert' }));
}).finally(() => app.setAttribute('aria-busy', 'false'));
