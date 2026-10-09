const heading = document.querySelector('#heading');
const alert = document.querySelector('#alert');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const projects = document.querySelector('#projects');

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function addProject(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
  row.append(name, open);
  projects.append(row);
  document.querySelector('#empty').hidden = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  if (!nameInput.value.trim()) {
    showError('Project name is required');
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const project = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value }),
    });
    addProject(project);
    nameInput.value = '';
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => {
  window.location.href = '/';
});

async function loadPage() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    document.querySelector('#project-detail').hidden = false;
    const project = await api(`/api/projects/${match[1]}`);
    heading.textContent = project.name;
    document.title = `${project.name} · Workboard`;
  } else {
    document.querySelector('#project-list').hidden = false;
    const items = await api('/api/projects');
    document.querySelector('#empty').hidden = items.length !== 0;
    items.forEach(addProject);
  }
}

loadPage().catch((error) => showError(error.message));
