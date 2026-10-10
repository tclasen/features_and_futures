const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Something went wrong');
  return value;
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

async function showProjects() {
  app.replaceChildren();
  app.append(element('h1', {}, 'Workboard'));

  const form = element('form', { class: 'project-form' });
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  input.setAttribute('aria-label', 'Project name');
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { class: 'alert', role: 'alert', hidden: '' });
  form.append(label, input, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      input.value = '';
      alert.hidden = true;
      await renderProjects();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  app.append(form, alert, element('div', { id: 'project-list', class: 'project-list' }));
  await renderProjects();
}

async function renderProjects() {
  const list = document.querySelector('#project-list');
  if (!list) return;
  const projects = await request('/api/projects');
  list.replaceChildren();
  for (const project of projects) {
    const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
    row.append(element('span', {}, project.name));
    const open = element('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(open);
    list.append(row);
  }
}

async function showProject(id) {
  app.replaceChildren();
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    app.append(element('h1', {}, project.name));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
  } catch {
    app.append(element('h1', {}, 'Project not found'));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
  }
}

const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
if (match) showProject(match[1]);
else showProjects();
