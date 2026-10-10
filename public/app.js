const listSection = document.querySelector('#project-list');
const detailSection = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');
const detailTitle = document.querySelector('#detail-title');

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed');
  return result;
}

function projectRow(project) {
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
  return row;
}

async function renderProjects() {
  const projects = await request('/api/projects');
  projectContainer.replaceChildren(...projects.map(projectRow));
}

async function renderRoute() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    listSection.hidden = false;
    detailSection.hidden = true;
    await renderProjects();
    return;
  }
  const project = await request(`/api/projects/${match[1]}`);
  detailTitle.textContent = project.name;
  listSection.hidden = true;
  detailSection.hidden = false;
}

function navigate(path) {
  window.history.pushState({}, '', path);
  renderRoute().catch(showError);
}

function showError(error) {
  alertMessage.textContent = error.message;
  alertMessage.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showError(new Error('Project name is required'));
    return;
  }
  alertMessage.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await renderProjects();
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', () => renderRoute().catch(showError));
renderRoute().catch(showError);
