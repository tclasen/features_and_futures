const heading = document.querySelector('#heading');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const empty = document.querySelector('#empty');
const input = document.querySelector('#project-name');

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load projects');
  return result;
}

function navigate(path) {
  window.location.assign(path);
}

async function renderProjects() {
  const data = await api('/api/projects');
  projects.replaceChildren();
  empty.hidden = data.length !== 0;
  for (const project of data) {
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
    projects.append(row);
  }
}

document.querySelector('#create-project').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const name = input.value.trim();
  if (!name) return showError('Project name is required');
  const button = event.submitter;
  button.disabled = true;
  try {
    await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    input.value = '';
    await renderProjects();
    input.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => navigate('/'));

async function initialize() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    list.hidden = true;
    detail.hidden = false;
    heading.textContent = 'Project';
    const project = await api(`/api/projects/${match[1]}`);
    heading.textContent = project.name;
    document.title = `${project.name} · Workboard`;
  } else {
    await renderProjects();
  }
}
initialize().catch((error) => showError(error.message));
