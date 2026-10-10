const content = document.querySelector('#content');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showProjects() {
  content.replaceChildren();
  const heading = element('h1', 'Workboard');
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
  const alert = element('p', undefined, 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit);
  const projectList = element('div', undefined, 'project-list');
  projectList.setAttribute('aria-label', 'Projects');
  content.append(heading, form, alert, projectList);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      input.value = '';
      await renderRows(projectList);
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  await renderRows(projectList);
}

async function renderRows(list) {
  const projects = await request('/api/projects');
  list.replaceChildren();
  for (const project of projects) {
    const row = element('article', undefined, 'project-row');
    row.dataset.testid = 'project-row';
    const name = element('span', project.name, 'project-name');
    const open = element('button', 'Open project');
    open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(name, open);
    list.append(row);
  }
}

async function showProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  content.replaceChildren();
  const back = element('button', 'Projects', 'back-button');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  content.append(back, element('h1', project.name));
}

const route = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (route) {
  showProject(route[1]).catch(() => { location.href = '/'; });
} else {
  showProjects().catch(() => {
    content.textContent = 'Unable to load Workboard.';
  });
}
