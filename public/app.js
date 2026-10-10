const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');
const errorMessage = document.querySelector('#error-message');
const projectsElement = document.querySelector('#projects');

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Something went wrong');
  return value;
}

function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  document.title = 'Workboard';
}

async function renderProjects() {
  const projects = await request('/api/projects');
  projectsElement.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`);
      renderRoute();
    });
    row.append(name, open);
    projectsElement.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match) {
    showList();
    await renderProjects();
    return;
  }
  try {
    const project = await request(`/api/projects/${encodeURIComponent(decodeURIComponent(match[1]))}`);
    document.querySelector('#project-title').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    listView.hidden = true;
    detailView.hidden = false;
  } catch {
    history.replaceState({}, '', '/');
    showList();
    await renderProjects();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  const name = nameInput.value.trim();
  if (!name) {
    errorMessage.textContent = 'Project name is required';
    errorMessage.hidden = false;
    nameInput.focus();
    return;
  }
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    form.reset();
    await renderProjects();
    nameInput.focus();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  history.pushState({}, '', '/');
  renderRoute();
});
window.addEventListener('popstate', renderRoute);
renderRoute();
