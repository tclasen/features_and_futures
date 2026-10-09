const form = document.querySelector('#project-form');
const input = document.querySelector('#project-name');
const alert = document.querySelector('#form-alert');
const list = document.querySelector('#project-list');

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  const projects = await response.json();
  list.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('article');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(name, open);
    list.append(row);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  alert.hidden = true;
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not create project');
    input.value = '';
    await loadProjects();
  } catch (error) {
    showError(error.message);
  }
});

loadProjects().catch((error) => showError(error.message));
