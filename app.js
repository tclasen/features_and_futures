const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const errorMessage = document.querySelector('#project-error');

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value;
}

function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  document.title = 'Workboard';
}

function showProject(project) {
  listView.hidden = true;
  detailView.hidden = false;
  document.querySelector('#project-title').textContent = project.name;
  document.title = `${project.name} · Workboard`;
}

function renderProjects(projects) {
  projectContainer.replaceChildren();
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
      history.pushState({}, '', `/projects/${project.id}`);
      showProject(project);
    });
    row.append(name, open);
    projectContainer.append(row);
  }
}

async function refreshProjects() {
  renderProjects(await request('/api/projects'));
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    showList();
    await refreshProjects();
    return;
  }
  try {
    const projects = await request('/api/projects');
    const project = projects.find((item) => item.id === Number(match[1]));
    if (!project) {
      history.replaceState({}, '', '/');
      showList();
      await refreshProjects();
      return;
    }
    showProject(project);
  } catch {
    showList();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value.trim() })
    });
    nameInput.value = '';
    await refreshProjects();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => {
  history.pushState({}, '', '/');
  showList();
  refreshProjects();
});

window.addEventListener('popstate', renderRoute);
renderRoute();
