const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#form-alert');
const projectsContainer = document.querySelector('#projects');
const listView = document.querySelector('#project-list-view');
const detailView = document.querySelector('#project-detail-view');
const pageTitle = document.querySelector('#page-title');
const projectTitle = document.querySelector('#project-title');

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed');
  return result;
}

function showAlert(message) {
  alert.textContent = message;
  alert.hidden = false;
}

function clearAlert() {
  alert.textContent = '';
  alert.hidden = true;
}

function projectRow(project) {
  const row = document.createElement('article');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';

  const name = document.createElement('span');
  name.className = 'project-name';
  name.textContent = project.name;

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.textContent = 'Open project';
  openButton.addEventListener('click', () => {
    window.history.pushState({}, '', `/projects/${project.id}`);
    renderRoute();
  });

  row.append(name, openButton);
  return row;
}

async function renderProjects() {
  const projects = await request('/api/projects');
  projectsContainer.replaceChildren(...projects.map(projectRow));
}

async function renderRoute() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    pageTitle.textContent = 'Workboard';
    await renderProjects();
    return;
  }

  try {
    const project = await request(`/api/projects/${match[1]}`);
    listView.hidden = true;
    detailView.hidden = false;
    projectTitle.textContent = project.name;
    pageTitle.textContent = project.name;
  } catch {
    window.history.replaceState({}, '', '/');
    await renderRoute();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showAlert('Project name is required');
    nameInput.focus();
    return;
  }

  clearAlert();
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await renderProjects();
  } catch (error) {
    showAlert(error.message);
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  window.history.pushState({}, '', '/');
  renderRoute();
});

window.addEventListener('popstate', renderRoute);
renderRoute();
