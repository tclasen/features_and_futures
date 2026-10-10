const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const error = document.querySelector('#error');

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { window.location.href = `/projects/${encodeURIComponent(project.id)}`; });
    row.append(name, open);
    projectContainer.append(row);
  }
}

async function showRoute() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch(`/api/projects/${encodeURIComponent(decodeURIComponent(match[1]))}`);
  if (!response.ok) {
    window.location.replace('/');
    return;
  }
  const project = await response.json();
  document.querySelector('#project-title').textContent = project.name;
  listView.hidden = true;
  detailView.hidden = false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: nameInput.value })
  });
  const result = await response.json();
  if (!response.ok) {
    error.textContent = result.error || 'Unable to create project';
    error.hidden = false;
    return;
  }
  nameInput.value = '';
  await loadProjects();
});

document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
showRoute().catch(() => {
  error.textContent = 'Unable to load projects';
  error.hidden = false;
});
