const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const alertBox = document.querySelector('#alert');

async function loadProjects() {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const container = document.querySelector('#projects');
  container.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
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

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    const response = await fetch(`/api/projects/${match[1]}`);
    if (response.ok) {
      const project = await response.json();
      document.querySelector('#project-title').textContent = project.name;
      list.hidden = true;
      detail.hidden = false;
      return;
    }
  }
  detail.hidden = true;
  list.hidden = false;
  await loadProjects();
}

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#project-name');
  const name = input.value.trim();
  if (!name) {
    alertBox.textContent = 'Project name is required';
    alertBox.hidden = false;
    return;
  }
  alertBox.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  if (response.ok) {
    input.value = '';
    await loadProjects();
  }
});
document.querySelector('#back').addEventListener('click', () => { location.href = '/'; });
render();
