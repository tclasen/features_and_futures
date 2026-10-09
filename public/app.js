const alert = document.querySelector('#alert');
const projectList = document.querySelector('#project-list');
const projectDetail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load projects');
  return result;
}

function appendProject(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  row.append(name, open);
  projects.append(row);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    appendProject(project);
    nameInput.value = '';
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

async function initialize() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    projectList.hidden = true;
    projectDetail.hidden = false;
    const project = await request(`/api/projects/${match[1]}`);
    document.querySelector('#heading').textContent = project.name;
    document.title = `${project.name} — Workboard`;
  } else {
    const result = await request('/api/projects');
    result.forEach(appendProject);
    form.querySelector('button').disabled = false;
  }
}

initialize().catch((error) => showError(error.message));
