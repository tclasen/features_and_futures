const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#form-alert');
const projectsContainer = document.querySelector('#projects');

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

async function renderProjects() {
  const projects = await request('/api/projects');
  projectsContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Open project';
    openButton.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(name, openButton);
    projectsContainer.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    showList();
    await renderProjects();
    return;
  }
  const project = await request(`/api/projects/${match[1]}`);
  document.querySelector('#project-title').textContent = project.name;
  document.title = `${project.name} · Workboard`;
  listView.hidden = true;
  detailView.hidden = false;
}

function navigate(path) {
  history.pushState({}, '', path);
  renderRoute().catch(showList);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value }),
    });
    nameInput.value = '';
    await renderProjects();
    nameInput.focus();
    return project;
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', () => renderRoute().catch(showList));
renderRoute().catch(showList);
