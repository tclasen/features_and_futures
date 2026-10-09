const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const notice = document.querySelector('#notice');

function showError(message) {
  notice.textContent = message;
  notice.hidden = false;
}
function clearError() {
  notice.textContent = '';
  notice.hidden = true;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  const projects = await response.json();
  const container = document.querySelector('#projects');
  container.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(name, open);
    container.append(row);
  }
}

async function showRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch(`/api/projects/${match[1]}`);
  if (!response.ok) {
    history.replaceState(null, '', '/');
    listView.hidden = false;
    detailView.hidden = true;
    showError('Project not found');
    await loadProjects();
    return;
  }
  const project = await response.json();
  document.querySelector('#project-title').textContent = project.name;
  listView.hidden = true;
  detailView.hidden = false;
}

document.querySelector('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const input = document.querySelector('#project-name');
  const name = input.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  try {
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to create project');
    input.value = '';
    await loadProjects();
  } catch (error) { showError(error.message); }
});

document.querySelector('#back-button').addEventListener('click', () => { location.href = '/'; });
showRoute().catch((error) => showError(error.message));
