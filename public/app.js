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
function alertMessage(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
}
function projectRow(project) {
  const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), open);
  return row;
}
async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    try {
      const project = await request(`/api/projects/${match[1]}`);
      document.title = `${project.name} — Workboard`;
      app.append(element('h1', project.name));
    } catch (error) { alertMessage(error.message); }
    return;
  }
  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, create);
  const list = element('section', '', { 'aria-label': 'Projects', class: 'projects' });
  app.append(form, list);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { alertMessage('Project name is required'); return; }
    create.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) { alertMessage(error.message); }
    finally { create.disabled = false; }
  });
  create.disabled = true;
  try {
    const projects = await request('/api/projects');
    for (const project of projects) list.append(projectRow(project));
  } catch (error) { alertMessage(error.message); }
  finally { create.disabled = false; }
}
render();
