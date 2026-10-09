const heading = document.querySelector('#heading');
const error = document.querySelector('#error');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');

function showError(message) {
  error.textContent = message;
  error.hidden = !message;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load projects');
  return result;
}

function renderProjects(items) {
  projects.replaceChildren();
  for (const project of items) {
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
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const name = nameInput.value.trim();
  if (!name) return showError('Project name is required');
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    renderProjects(await api('/api/projects'));
    nameInput.value = '';
    nameInput.focus();
  } catch (failure) {
    showError(failure.message);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

async function initialize() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  try {
    if (match) {
      detail.hidden = false;
      const project = await api(`/api/projects/${match[1]}`);
      heading.textContent = project.name;
      document.title = `${project.name} — Workboard`;
    } else {
      list.hidden = false;
      renderProjects(await api('/api/projects'));
    }
  } catch (failure) {
    showError(failure.message);
  }
}
initialize();
