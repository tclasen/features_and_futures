const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectsContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');

async function loadProjects() {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  projectsContainer.replaceChildren();
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
    projectsContainer.append(row);
  }
}

async function showRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const project = projects.find((item) => String(item.id) === match[1]);
  if (!project) {
    navigate('/');
    return;
  }
  document.title = `${project.name} · Workboard`;
  document.querySelector('#project-heading').textContent = project.name;
  listView.hidden = true;
  detailView.hidden = false;
}

function navigate(path) {
  history.pushState({}, '', path);
  showRoute();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alertMessage.textContent = 'Project name is required';
    alertMessage.hidden = false;
    return;
  }
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) return;
  alertMessage.hidden = true;
  nameInput.value = '';
  await loadProjects();
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', showRoute);
showRoute();
