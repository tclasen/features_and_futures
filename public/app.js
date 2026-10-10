const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const input = document.querySelector('#project-name');
const error = document.querySelector('#error');

function showError(message = '') {
  error.textContent = message;
  error.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  row.append(name, button);
  return row;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) return showError('Project name is required');
  showError();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    projects.append(projectRow(project));
    input.value = '';
    input.focus();
  } catch (failure) {
    showError(failure.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => {
  window.location.assign('/');
});

async function load() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  list.hidden = Boolean(match);
  detail.hidden = !match;
  try {
    if (match) {
      const project = await request(`/api/projects/${match[1]}`);
      document.querySelector('#project-heading').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } else {
      const data = await request('/api/projects');
      projects.replaceChildren(...data.map(projectRow));
    }
  } catch (failure) {
    showError(failure.message);
  }
}

await load();
