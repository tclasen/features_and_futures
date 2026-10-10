const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.type) node.type = options.type;
  if (options.label) node.setAttribute('aria-label', options.label);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showError(message) {
  const alert = element('p', { className: 'alert', text: message });
  alert.setAttribute('role', 'alert');
  const previous = app.querySelector('[role="alert"]');
  previous?.remove();
  app.prepend(alert);
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function showProjects() {
  const heading = element('h1', { text: 'Workboard' });
  const form = element('form', { className: 'create-form' });
  const label = element('label', { text: 'Project name' });
  label.htmlFor = 'project-name';
  const input = element('input', { type: 'text' });
  input.id = 'project-name';
  input.name = 'name';
  const submit = element('button', { type: 'submit', text: 'Create project' });
  form.append(label, input, submit);
  const list = element('div', { className: 'project-list' });
  const projects = await request('/api/projects');
  for (const project of projects) {
    const row = element('article', { className: 'project-row' });
    row.dataset.testid = 'project-row';
    row.append(element('span', { text: project.name }));
    const open = element('button', { type: 'button', text: 'Open project' });
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(open);
    list.append(row);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      render();
    } catch (error) {
      showError(error.message);
    }
  });
  app.replaceChildren(heading, form, list);
}

async function showProject(id) {
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    const heading = element('h1', { text: project.name });
    const back = element('button', { type: 'button', text: 'Projects' });
    back.addEventListener('click', () => navigate('/'));
    app.replaceChildren(heading, back);
  } catch {
    app.replaceChildren(element('h1', { text: 'Project not found' }));
    const back = element('button', { type: 'button', text: 'Projects' });
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
  }
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  try {
    if (match) await showProject(match[1]);
    else await showProjects();
  } catch {
    showError('Unable to load projects');
  }
}

window.addEventListener('popstate', render);
render();
