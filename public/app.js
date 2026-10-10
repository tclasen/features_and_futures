const heading = document.querySelector('h1');
const alert = document.querySelector('#alert');
const projectsView = document.querySelector('#projects');
const detailView = document.querySelector('#project-detail');
const list = document.querySelector('#project-list');
const form = document.querySelector('#create-project');
const input = document.querySelector('#project-name');

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
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
  open.addEventListener('click', () => navigate(`/projects/${project.id}`));
  row.append(name, open);
  return row;
}

async function render() {
  alert.hidden = true;
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  projectsView.hidden = Boolean(match);
  detailView.hidden = !match;
  heading.textContent = match ? 'Loading project…' : 'Workboard';
  try {
    if (match) {
      const project = await api(`/api/projects/${match[1]}`);
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } else {
      document.title = 'Workboard';
      const projects = await api('/api/projects');
      list.replaceChildren(...projects.map(projectRow));
    }
  } catch (error) {
    heading.textContent = 'Workboard';
    showError(error.message);
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  const name = input.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const project = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    list.append(projectRow(project));
    input.value = '';
    input.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', render);
render();
