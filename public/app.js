const app = document.querySelector('#app');

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

async function projectsPage() {
  document.title = 'Workboard';
  app.replaceChildren(element('h1', {}, 'Workboard'));

  const form = element('form', { class: 'create-form' });
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { role: 'alert', class: 'alert' });
  form.append(label, input, submit);
  const list = element('section', { 'aria-label': 'Projects' });
  app.append(form, alert, list);

  async function loadProjects() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.textContent = '';
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.value }),
    });
    const result = await response.json();
    if (!response.ok) {
      alert.textContent = result.error || 'Unable to create project';
      return;
    }
    input.value = '';
    await loadProjects();
  });

  await loadProjects();
}

async function projectPage(projectId) {
  const response = await fetch(`/api/projects/${projectId}`);
  if (!response.ok) {
    app.replaceChildren(element('h1', {}, 'Project not found'));
    return;
  }
  const project = await response.json();
  document.title = `${project.name} · Workboard`;
  const back = element('button', { type: 'button' }, 'Projects');
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.replaceChildren(back, element('h1', {}, project.name));
}

const match = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) projectPage(match[1]);
else projectsPage();
