const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#form-alert');

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) return;
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      history.pushState({}, '', `/projects/${project.id}`);
      showRoute();
    });
    row.append(name, open);
    projectContainer.append(row);
  }
}

async function showRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    detailView.hidden = true;
    listView.hidden = false;
    await loadProjects();
    return;
  }
  const response = await fetch(`/api/projects/${match[1]}`);
  if (!response.ok) {
    history.replaceState({}, '', '/');
    return showRoute();
  }
  const project = await response.json();
  document.querySelector('#detail-name').textContent = project.name;
  detailView.hidden = false;
  listView.hidden = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alert.textContent = 'Project name is required';
    alert.hidden = false;
    nameInput.focus();
    return;
  }
  alert.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (response.ok) {
    nameInput.value = '';
    await loadProjects();
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  history.pushState({}, '', '/');
  showRoute();
});
window.addEventListener('popstate', showRoute);
showRoute();
