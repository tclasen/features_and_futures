const app = document.querySelector('#app');
const form = document.querySelector('#create-form');
const input = document.querySelector('#project-name');
const error = document.querySelector('#error');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');

async function projects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  return response.json();
}

function showList() {
  document.title = 'Workboard';
  app.querySelector('h1').hidden = false;
  form.hidden = false;
  list.hidden = false;
  detail.hidden = true;
}

async function renderList() {
  showList();
  const items = await projects();
  list.replaceChildren();
  for (const project of items) {
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
    list.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) return renderList();
  const items = await projects();
  const project = items.find(item => String(item.id) === match[1]);
  if (!project) return renderList();
  document.title = `${project.name} — Workboard`;
  app.querySelector('h1').hidden = true;
  form.hidden = true;
  list.hidden = true;
  detail.hidden = false;
  detail.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { location.href = '/'; });
  detail.append(heading, back);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  const name = input.value.trim();
  if (!name) {
    error.textContent = 'Project name is required';
    error.hidden = false;
    return;
  }
  const response = await fetch('/api/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  if (!response.ok) {
    const result = await response.json();
    error.textContent = result.error || 'Unable to create project';
    error.hidden = false;
    return;
  }
  input.value = '';
  await renderList();
});

renderRoute().catch(error => {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = error.message;
  app.append(message);
});
