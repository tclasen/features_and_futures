const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function element(tag, attributes = {}, content = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'className') node.className = value;
    else node.setAttribute(name, value);
  }
  if (content) node.textContent = content;
  return node;
}

function go(path) {
  history.pushState({}, '', path);
  render();
}

async function renderList() {
  app.replaceChildren();
  app.append(element('h1', {}, 'Workboard'));
  const form = element('form', { className: 'create-form' });
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { className: 'alert', role: 'alert', hidden: '' });
  form.append(label, input, submit);
  app.append(form, alert);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      const name = input.value.trim();
      if (!name) throw new Error('Project name is required');
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      input.value = '';
      await loadProjects(list);
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  const list = element('section', { className: 'projects', 'aria-label': 'Projects' });
  app.append(list);
  await loadProjects(list);
}

async function loadProjects(list) {
  const projects = await request('/api/projects');
  list.replaceChildren();
  for (const project of projects) {
    const row = element('article', { 'data-testid': 'project-row', className: 'project-row' });
    row.append(element('span', {}, project.name));
    const open = element('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => go(`/projects/${project.id}`));
    row.append(open);
    list.append(row);
  }
}

async function renderProject(id) {
  app.replaceChildren();
  const back = element('button', { type: 'button', className: 'back-button' }, 'Projects');
  back.addEventListener('click', () => go('/'));
  app.append(back);
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    app.append(element('h1', {}, project.name));
  } catch {
    app.append(element('h1', {}, 'Project not found'));
  }
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (match) await renderProject(match[1]);
  else await renderList();
}

window.addEventListener('popstate', render);
render();
