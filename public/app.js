const heading = document.querySelector('#heading');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load projects');
  return result;
}

function renderProjects(items) {
  projects.replaceChildren();
  document.querySelector('#empty').hidden = items.length > 0;
  for (const project of items) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
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
  alert.hidden = true;
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    renderProjects(await request('/api/projects'));
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

async function loadPage() {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    detail.hidden = false;
    const project = await request(`/api/projects/${match[1]}`);
    heading.textContent = project.name;
    document.title = `${project.name} — Workboard`;
  } else {
    list.hidden = false;
    renderProjects(await request('/api/projects'));
  }
}

loadPage().catch((error) => showError(error.message));
