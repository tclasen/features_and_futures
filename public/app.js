const listView = document.querySelector('#projects-view');
const detailView = document.querySelector('#project-view');
const projectList = document.querySelector('#project-list');
const nameInput = document.querySelector('#project-name');
const form = document.querySelector('#project-form');
const submitButton = form.querySelector('button');
const listAlert = document.querySelector('#list-alert');
const detailAlert = document.querySelector('#detail-alert');
const heading = document.querySelector('#project-heading');
let renderVersion = 0;

function showAlert(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Unable to complete request');
  return value;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
}

function projectRow(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => navigate(`/projects/${project.id}`));
  row.append(name, button);
  return row;
}

async function render() {
  const version = ++renderVersion;
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  listView.hidden = !!match;
  detailView.hidden = !match;
  showAlert(listAlert);
  showAlert(detailAlert);
  heading.textContent = '';
  try {
    if (match) {
      const project = await api(`/api/projects/${match[1]}`);
      if (version !== renderVersion) return;
      heading.textContent = project.name;
      document.title = `${project.name} — Workboard`;
    } else {
      document.title = 'Workboard';
      const projects = await api('/api/projects');
      if (version !== renderVersion) return;
      projectList.replaceChildren(...projects.map(projectRow));
    }
  } catch (error) {
    if (version === renderVersion) showAlert(match ? detailAlert : listAlert, error.message);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showAlert(listAlert, 'Project name is required');
    nameInput.focus();
    return;
  }
  submitButton.disabled = true;
  showAlert(listAlert);
  try {
    await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await render();
    nameInput.focus();
  } catch (error) {
    showAlert(listAlert, error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', render);
render();
