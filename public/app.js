const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const errorMessage = document.querySelector('#error-message');

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
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

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch(`/api/projects/${match[1]}`);
  if (!response.ok) {
    navigate('/');
    return;
  }
  const project = await response.json();
  document.querySelector('#project-title').textContent = project.name;
  listView.hidden = true;
  detailView.hidden = false;
}

function navigate(path) {
  history.pushState({}, '', path);
  renderRoute().catch(showLoadError);
}

function showLoadError() {
  errorMessage.textContent = 'Unable to load projects';
  errorMessage.hidden = false;
}

document.querySelector('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#project-name');
  const name = input.value.trim();
  if (!name) {
    errorMessage.textContent = 'Project name is required';
    errorMessage.hidden = false;
    return;
  }
  errorMessage.hidden = true;
  try {
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Could not create project');
    input.value = '';
    await loadProjects();
  } catch { showLoadError(); }
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', () => renderRoute().catch(showLoadError));
renderRoute().catch(showLoadError);
