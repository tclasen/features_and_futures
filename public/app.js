const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');
const projectList = document.querySelector('#project-list');
const projectCount = document.querySelector('#project-count');

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Something went wrong');
  return value;
}

function showAlert(message = '') {
  alertMessage.textContent = message;
  alertMessage.hidden = !message;
}

function renderProjects(projects) {
  projectList.replaceChildren();
  projectCount.textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`;

  if (projects.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Your projects will appear here.';
    projectList.append(emptyState);
    return;
  }

  for (const project of projects) {
    const row = document.createElement('article');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';

    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'secondary-button';
    openButton.textContent = 'Open project';
    openButton.addEventListener('click', () => {
      window.location.href = `/projects/${encodeURIComponent(project.id)}`;
    });

    row.append(name, openButton);
    projectList.append(row);
  }
}

async function loadProjects() {
  renderProjects(await request('/api/projects'));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showAlert('Project name is required');
    nameInput.focus();
    return;
  }

  showAlert();
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    });
    nameInput.value = '';
    await loadProjects();
    nameInput.focus();
  } catch (error) {
    showAlert(error.message);
  }
});

const projectRoute = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (projectRoute) {
  const id = decodeURIComponent(projectRoute[1]);
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    document.querySelector('body').innerHTML = `
      <main class="workspace project-detail">
        <button class="back-button" type="button">← Projects</button>
        <header class="page-header detail-header">
          <p class="eyebrow">Project</p>
          <h1></h1>
        </header>
      </main>`;
    document.querySelector('h1').textContent = project.name;
    document.querySelector('.back-button').addEventListener('click', () => {
      window.location.href = '/';
    });
  } catch {
    document.querySelector('body').innerHTML = '<main class="workspace"><h1>Project not found</h1><a href="/">Projects</a></main>';
  }
} else {
  try {
    await loadProjects();
  } catch (error) {
    showAlert(error.message);
  }
}
