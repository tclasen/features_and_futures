const content = document.querySelector('#content');
const projectRoute = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);

if (projectRoute) {
  showProject(projectRoute[1]);
} else {
  showProjects();
}

async function showProjects() {
  content.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'Workboard';
  const form = document.createElement('form');
  form.className = 'project-form';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Create project';
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, button);
  const list = document.createElement('div');
  list.className = 'project-list';
  content.append(heading, form, alert, list);

  async function loadProjects() {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Could not load projects');
    const projects = await response.json();
    list.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('article');
      row.dataset.testid = 'project-row';
      row.className = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
      row.append(name, open);
      list.append(row);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    alert.hidden = true;
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const result = await response.json();
      alert.textContent = result.error ?? 'Unable to create project';
      alert.hidden = false;
      return;
    }
    input.value = '';
    await loadProjects();
  });
  await loadProjects();
}

async function showProject(id) {
  content.replaceChildren();
  const response = await fetch('/api/projects');
  if (!response.ok) {
    content.textContent = 'Unable to load project';
    return;
  }
  const projects = await response.json();
  const project = projects.find((item) => String(item.id) === id);
  if (!project) {
    const heading = document.createElement('h1');
    heading.textContent = 'Project not found';
    content.append(heading, projectsButton());
    return;
  }
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  content.append(heading, projectsButton());
}

function projectsButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Projects';
  button.addEventListener('click', () => { window.location.href = '/'; });
  return button;
}
