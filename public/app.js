const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

async function showProjects(errorMessage = '') {
  app.replaceChildren(element('h1', {}, 'Workboard'));
  const form = element('form');
  const label = element('label', {}, 'Project name');
  const input = element('input', { name: 'name', type: 'text', autocomplete: 'off' });
  input.id = 'project-name';
  label.htmlFor = input.id;
  label.append(input);
  form.append(label, element('button', { type: 'submit' }, 'Create project'));
  app.append(form);

  if (errorMessage) app.append(element('p', { class: 'error', role: 'alert' }, errorMessage));
  const list = element('section', { class: 'project-list', 'aria-label': 'Projects' });
  for (const project of await request('/api/projects')) {
    const row = element('div', { 'data-testid': 'project-row' });
    row.append(element('span', {}, project.name));
    const open = element('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(open);
    list.append(row);
  }
  app.append(list);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      await showProjects();
    } catch (error) {
      await showProjects(error.message);
    }
  });
}

async function showProject(id) {
  const projects = await request('/api/projects');
  const project = projects.find((item) => String(item.id) === id);
  if (!project) {
    app.append(element('h1', {}, 'Project not found'));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    return;
  }
  const back = element('button', { class: 'back', type: 'button' }, 'Projects');
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back, element('h1', {}, project.name));
}

const projectRoute = window.location.pathname.match(/^\/projects\/(\d+)$/);
if (projectRoute) {
  showProject(projectRoute[1]).catch(() => showProjects('Unable to load project'));
} else {
  showProjects().catch(() => { app.append(element('h1', {}, 'Workboard'), element('p', { role: 'alert' }, 'Unable to load projects')); });
}
