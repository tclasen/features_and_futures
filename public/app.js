const errorMessage = document.querySelector('#error');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const rows = document.querySelector('#project-rows');

function showError(message = '') {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Unable to complete request');
  return data;
}

function addProjectRow(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
  rows.append(row);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError();
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
    addProjectRow(project);
    nameInput.value = '';
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => {
  window.location.href = '/';
});

async function initialize() {
  const match = /^\/projects\/([1-9]\d*)$/.exec(window.location.pathname);
  if (match) {
    document.querySelector('#project-detail').hidden = false;
    const project = await request(`/api/projects/${match[1]}`);
    document.querySelector('#project-title').textContent = project.name;
    document.title = `${project.name} · Workboard`;
  } else {
    const projects = await request('/api/projects');
    projects.forEach(addProjectRow);
    document.querySelector('#project-list').hidden = false;
  }
}
initialize().catch((error) => showError(error.message));
