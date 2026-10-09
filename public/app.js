const view = document.querySelector('#project-view');
const pathMatch = location.pathname.match(/^\/projects\/(\d+)\/?$/);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showProjects() {
  view.replaceChildren();
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const button = element('button', 'Create project');
  button.type = 'submit';
  const alert = element('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, button, alert);
  const list = element('div', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  view.append(form, list);

  async function refresh() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    list.replaceChildren();
    for (const project of projects) {
      const row = element('article', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', project.name, 'project-name'));
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(open);
      list.append(row);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const result = await response.json();
      alert.textContent = result.error;
      alert.hidden = false;
      return;
    }
    input.value = '';
    alert.hidden = true;
    await refresh();
  });
  await refresh();
}

async function showProject(id) {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const project = projects.find(item => String(item.id) === id);
  if (!project) {
    view.append(element('h2', 'Project not found'));
    const back = element('button', 'Projects');
    back.addEventListener('click', () => { location.href = '/'; });
    view.append(back);
    return;
  }
  const back = element('button', 'Projects', 'back-button');
  back.addEventListener('click', () => { location.href = '/'; });
  view.append(back, element('h2', project.name));
}

if (pathMatch) showProject(pathMatch[1]);
else showProjects();
