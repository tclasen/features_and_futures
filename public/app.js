const alert = document.querySelector('#alert');
const heading = document.querySelector('h1');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#project-form');
const input = document.querySelector('#project-name');

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
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
  const name = input.value.trim();
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
    input.value = '';
    input.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

async function load() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  list.hidden = Boolean(match);
  detail.hidden = !match;
  try {
    if (match) {
      const project = await request(`/api/projects/${match[1]}`);
      heading.textContent = project.name;
      document.title = `${project.name} — Workboard`;
    } else {
      const data = await request('/api/projects');
      data.forEach(appendProject);
    }
  } catch (error) {
    showError(error.message);
  }
}
load();
