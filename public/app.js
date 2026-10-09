const heading = document.querySelector('#heading');
const alert = document.querySelector('#error');
const listPage = document.querySelector('#project-list');
const detailPage = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function appendProject(project) {
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    nameInput.focus();
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const project = await api('/api/projects', {
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

async function loadPage() {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    detailPage.hidden = false;
    try {
      const project = await api(`/api/projects/${match[1]}`);
      heading.textContent = project.name;
      document.title = `${project.name} — Workboard`;
    } catch (error) {
      heading.textContent = 'Project unavailable';
      showError(error.message);
    }
  } else {
    try {
      const all = await api('/api/projects');
      all.forEach(appendProject);
    } catch (error) {
      showError(error.message);
    }
    listPage.hidden = false;
  }
}

loadPage();
