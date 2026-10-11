const projectsView = document.querySelector('#projects-view');
const projectView = document.querySelector('#project-view');
const form = document.querySelector('#project-form');
const input = document.querySelector('#project-name');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load projects');
  return body;
}

function showAlert(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

function addProject(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => {
    window.location.href = `/projects/${encodeURIComponent(project.id)}`;
  });
  row.append(name, button);
  list.append(row);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    showAlert('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  showAlert('');
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    addProject(project);
    input.value = '';
    input.focus();
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  window.location.href = '/';
});

async function initialize() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)$/);
  if (match) {
    projectsView.hidden = true;
    projectView.hidden = false;
    try {
      const project = await request(`/api/projects/${match[1]}`);
      document.querySelector('#project-heading').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      const projectError = document.querySelector('#project-error');
      projectError.textContent = error.message;
      projectError.hidden = false;
    }
  } else {
    form.querySelector('button').disabled = true;
    try {
      const projects = await request('/api/projects');
      projects.forEach(addProject);
    } catch (error) {
      showAlert(error.message);
    } finally {
      form.querySelector('button').disabled = false;
    }
  }
}

initialize();
