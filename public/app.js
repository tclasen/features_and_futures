const listPage = document.querySelector('#project-list');
const detailPage = document.querySelector('#project-detail');
const projectItems = document.querySelector('#project-list-items');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#project-count');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');

async function fetchProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function renderProjects(projects) {
  projectItems.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('article');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';

    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'open-button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));

    row.append(name, open);
    projectItems.append(row);
  }
  count.textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`;
  emptyState.hidden = projects.length > 0;
}

function showRoute() {
  const projectMatch = location.pathname.match(/^\/projects\/(\d+)$/);
  listPage.hidden = Boolean(projectMatch);
  detailPage.hidden = !projectMatch;
  if (projectMatch) {
    fetchProjects().then((projects) => {
      const project = projects.find((item) => String(item.id) === projectMatch[1]);
      document.querySelector('#project-title').textContent = project?.name ?? 'Project not found';
    });
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  showRoute();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alertMessage.textContent = 'Project name is required';
    alertMessage.hidden = false;
    return;
  }
  alertMessage.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const result = await response.json();
    alertMessage.textContent = result.error || 'Could not create project';
    alertMessage.hidden = false;
    return;
  }
  nameInput.value = '';
  renderProjects(await fetchProjects());
  nameInput.focus();
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', showRoute);

fetchProjects().then(renderProjects).catch(() => {
  alertMessage.textContent = 'Could not load projects';
  alertMessage.hidden = false;
});
showRoute();
