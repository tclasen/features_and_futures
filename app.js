const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectList = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#form-alert');

async function fetchProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function renderProjects(projects) {
  projectList.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(name, open);
    projectList.append(row);
  }
}

async function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  renderProjects(await fetchProjects());
}

async function showProject(id) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) {
    navigate('/');
    return;
  }
  const project = await response.json();
  document.querySelector('#detail-heading').textContent = project.name;
  listView.hidden = true;
  detailView.hidden = false;
}

function navigate(path) {
  history.pushState({}, '', path);
  renderRoute();
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  try {
    if (match) await showProject(match[1]);
    else await showList();
  } catch {
    listView.hidden = false;
    detailView.hidden = true;
    alert.textContent = 'Unable to load projects';
    alert.hidden = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
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
    alert.textContent = 'Unable to create project';
    alert.hidden = false;
    return;
  }
  nameInput.value = '';
  renderProjects(await fetchProjects());
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', renderRoute);
renderRoute();
