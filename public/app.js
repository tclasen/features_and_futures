const heading = document.querySelector('#heading');
const alert = document.querySelector('#alert');
const projectList = document.querySelector('#project-list');
const projectDetail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function renderProjects(items) {
  projects.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No projects yet. Create your first project above.';
    projects.append(empty);
  }
  for (const project of items) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      window.location.assign(`/projects/${project.id}`);
    });
    row.append(name, open);
    projects.append(row);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    nameInput.focus();
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    renderProjects(await request('/api/projects'));
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => {
  window.location.assign('/');
});

async function loadPage() {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    projectList.hidden = true;
    projectDetail.hidden = false;
    heading.textContent = 'Project';
    const project = await request(`/api/projects/${match[1]}`);
    heading.textContent = project.name;
    document.title = `${project.name} · Workboard`;
  } else {
    renderProjects(await request('/api/projects'));
  }
}

loadPage().catch((error) => showError(error.message));
