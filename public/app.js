const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function showError(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = false;
}

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.textContent = 'Open project';
  button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  row.append(name, button);
  return row;
}

async function showProjects() {
  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p role="alert" hidden></p>
    <ul class="projects"></ul>
  `;
  const list = app.querySelector('ul');
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const submit = form.querySelector('button');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showError('Project name is required');
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      app.querySelector('[role="alert"]').hidden = true;
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  // Load existing rows before allowing new submissions, preserving creation order.
  submit.disabled = true;
  try {
    const projects = await api('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
  } finally {
    submit.disabled = false;
  }
}

async function showProject(id) {
  app.innerHTML = '<button type="button">Projects</button><h1></h1><p role="alert" hidden></p>';
  app.querySelector('button').addEventListener('click', () => location.assign('/'));
  const project = await api(`/api/projects/${id}`);
  app.querySelector('h1').textContent = project.name;
  document.title = `${project.name} — Workboard`;
}

try {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  showError(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
