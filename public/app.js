const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const alert = document.querySelector('#alert');

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  const projects = await response.json();
  const container = document.querySelector('#projects');
  container.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(name, button);
    container.append(row);
  }
}

async function showPage() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    detailView.hidden = true;
    listView.hidden = false;
    await loadProjects();
    return;
  }
  listView.hidden = true;
  detailView.hidden = false;
  const response = await fetch(`/api/projects/${match[1]}`);
  if (!response.ok) {
    document.querySelector('#project-title').textContent = 'Project not found';
    return;
  }
  const project = await response.json();
  document.querySelector('#project-title').textContent = project.name;
}

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#project-name');
  const name = input.value.trim();
  if (!name) {
    alert.textContent = 'Project name is required';
    alert.hidden = false;
    return;
  }
  const response = await fetch('/api/projects', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
  });
  if (!response.ok) {
    alert.textContent = 'Project name is required';
    alert.hidden = false;
    return;
  }
  input.value = '';
  alert.hidden = true;
  await loadProjects();
});

document.querySelector('#back-button').addEventListener('click', () => { location.href = '/'; });
showPage().catch(() => {
  alert.textContent = 'Unable to load Workboard';
  alert.hidden = false;
  listView.hidden = false;
});
