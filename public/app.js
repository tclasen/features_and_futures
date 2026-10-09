const projectsView = document.querySelector('#projects-view');
const projectView = document.querySelector('#project-view');
const projectList = document.querySelector('#project-list');
const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#project-name');
const projectAlert = document.querySelector('#project-alert');
const detailAlert = document.querySelector('#detail-alert');

function showAlert(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load projects');
  return body;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
}

async function render() {
  const path = location.pathname;
  const match = path.match(/^\/projects\/(\d+)$/);
  projectsView.hidden = Boolean(match);
  projectView.hidden = !match;
  showAlert(projectAlert);
  showAlert(detailAlert);
  if (match) {
    document.querySelector('#project-heading').textContent = 'Loading project…';
    try {
      const project = await api(`/api/projects/${match[1]}`);
      if (location.pathname !== path) return;
      document.querySelector('#project-heading').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      if (location.pathname !== path) return;
      document.querySelector('#project-heading').textContent = 'Project unavailable';
      showAlert(detailAlert, error.message);
    }
    return;
  }
  document.title = 'Workboard';
  try {
    const projects = await api('/api/projects');
    if (location.pathname !== path) return;
    projectList.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('div');
      row.dataset.testid = 'project-row';
      row.className = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(name, open);
      projectList.append(row);
    }
  } catch (error) {
    showAlert(projectAlert, error.message);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showAlert(projectAlert, 'Project name is required');
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  showAlert(projectAlert);
  try {
    await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await render();
  } catch (error) {
    showAlert(projectAlert, error.message);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', render);
render();
