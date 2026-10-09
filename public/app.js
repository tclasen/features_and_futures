const heading = document.querySelector('h1');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
  return row;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  if (!nameInput.value.trim()) {
    showError('Project name is required');
    nameInput.focus();
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value }),
    });
    projects.append(projectRow(project));
    document.querySelector('#empty').hidden = true;
    form.reset();
    nameInput.focus();
  } catch (error) { showError(error.message); }
  finally { submit.disabled = false; }
});

document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });

async function load() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  list.hidden = Boolean(match);
  detail.hidden = !match;
  try {
    if (match) {
      const project = await request(`/api/projects/${match[1]}`);
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } else {
      const allProjects = await request('/api/projects');
      projects.replaceChildren(...allProjects.map(projectRow));
      document.querySelector('#empty').hidden = allProjects.length > 0;
    }
  } catch (error) { showError(error.message); }
}

load();
