const listSection = document.querySelector('#project-list');
const detailSection = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const errorMessage = document.querySelector('#error-message');

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  const projects = await response.json();
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
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(name, open);
    projectContainer.append(row);
  }
}

async function showRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    listSection.hidden = false;
    detailSection.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const project = projects.find(item => String(item.id) === match[1]);
  if (!project) {
    navigate('/', true);
    return;
  }
  document.querySelector('#detail-name').textContent = project.name;
  listSection.hidden = true;
  detailSection.hidden = false;
}

function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  showRoute();
}

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  errorMessage.hidden = true;
  const input = document.querySelector('#project-name');
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.value })
  });
  if (!response.ok) {
    const result = await response.json();
    errorMessage.textContent = result.error || 'Unable to create project';
    errorMessage.hidden = false;
    return;
  }
  input.value = '';
  await loadProjects();
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', showRoute);
showRoute();
