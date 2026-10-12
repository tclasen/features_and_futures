const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectsNode = document.querySelector('#projects');
const alertNode = document.querySelector('#form-alert');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  history.pushState({}, '', '/');
  loadProjects();
}

async function loadProjects() {
  const projects = await request('/api/projects');
  projectsNode.replaceChildren();
  document.querySelector('#project-count').textContent = projects.length ? String(projects.length).padStart(2, '0') : '';
  if (!projects.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<span class="empty-icon" aria-hidden="true">◇</span><strong>No projects yet</strong><span>Create your first project to get started.</span>';
    projectsNode.append(empty);
    return;
  }
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;
    const button = document.createElement('button');
    button.className = 'open-button';
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => openProject(project.id));
    row.append(name, button);
    projectsNode.append(row);
  }
}

async function openProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  document.querySelector('#detail-name').textContent = project.name;
  listView.hidden = true;
  detailView.hidden = false;
  history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`);
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/([^/]+)$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  try {
    const project = await request(`/api/projects/${encodeURIComponent(decodeURIComponent(match[1]))}`);
    document.querySelector('#detail-name').textContent = project.name;
    listView.hidden = true;
    detailView.hidden = false;
  } catch {
    history.replaceState({}, '', '/');
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alertNode.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value })
    });
    nameInput.value = '';
    await loadProjects();
  } catch (error) {
    alertNode.textContent = error.message;
    alertNode.hidden = false;
  }
});

document.querySelector('#back-button').addEventListener('click', showList);
window.addEventListener('popstate', renderRoute);
renderRoute();
