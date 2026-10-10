const root = document.querySelector('#app');

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showList() {
  root.replaceChildren();
  root.append(element('h1', 'Workboard'));
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  form.append(label, input, submit);
  const error = element('p', undefined, 'alert');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Project name is required';
      error.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (response.ok) {
      input.value = '';
      await showList();
    }
  });
  root.append(form, error);
  try {
    const projects = await getProjects();
    const list = element('section', undefined, 'projects');
    list.setAttribute('aria-label', 'Projects');
    for (const project of projects) {
      const row = element('div', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', project.name));
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(open);
      list.append(row);
    }
    root.append(list);
  } catch {
    const message = element('p', 'Could not load projects');
    message.setAttribute('role', 'alert');
    root.append(message);
  }
}

async function showProject(id) {
  root.replaceChildren();
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  root.append(back);
  try {
    const projects = await getProjects();
    const project = projects.find((item) => String(item.id) === id);
    if (project) root.append(element('h1', project.name));
    else root.append(element('h1', 'Project not found'));
  } catch {
    root.append(element('h1', 'Could not load project'));
  }
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) showProject(match[1]);
else showList();
