const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

async function projects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', undefined, { role: 'alert' });
    app.insertBefore(alert, app.querySelector('form') || app.firstChild);
  }
  alert.textContent = message;
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text', 'aria-label': 'Project name' });
  const button = element('button', 'Create project', { type: 'submit' });
  form.append(input, button);
  app.append(form);
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  app.append(list);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: input.value }),
    });
    if (!response.ok) {
      const result = await response.json();
      showError(result.error || 'Could not create project');
      return;
    }
    await renderList();
  });

  for (const project of await projects()) {
    const row = element('div', undefined, { 'data-testid': 'project-row' });
    const name = element('span', project.name);
    const open = element('button', 'Open project', { type: 'button' });
    open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(name, open);
    list.append(row);
  }
}

async function renderProject(id) {
  const allProjects = await projects();
  const project = allProjects.find((item) => String(item.id) === id);
  if (!project) {
    app.replaceChildren(element('h1', 'Project not found'));
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    return;
  }
  const back = element('button', 'Projects', { type: 'button', class: 'back' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.replaceChildren(back, element('h1', project.name));
}

const projectMatch = window.location.pathname.match(/^\/projects\/(\d+)$/);
(projectMatch ? renderProject(projectMatch[1]) : renderList()).catch((error) => {
  console.error(error);
  app.replaceChildren(element('p', 'Could not load Workboard.', { role: 'alert' }));
});
