const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete request');
  return result;
}

function showError(message) {
  const alert = document.querySelector('#error');
  alert.textContent = message;
  alert.hidden = false;
}

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  row.append(name, button);
  return row;
}

async function showProjects() {
  app.innerHTML = `
    <h1>Workboard</h1>
    <form id="create-project" novalidate>
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p id="error" role="alert" hidden></p>
    <h2>Projects</h2>
    <ul id="projects"></ul>`;
  const list = document.querySelector('#projects');
  const form = document.querySelector('#create-project');
  const input = document.querySelector('#project-name');
  const submit = form.querySelector('button');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    document.querySelector('#error').hidden = true;
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
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  // Finish loading before enabling creation so rows always remain in creation order.
  submit.disabled = true;
  try {
    const projects = await api('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
  } finally {
    submit.disabled = false;
  }
}

async function showProject(id) {
  app.innerHTML = `
    <button id="back" type="button">Projects</button>
    <h1>Loading project…</h1>
    <p id="error" role="alert" hidden></p>`;
  document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));
  const project = await api(`/api/projects/${id}`);
  document.querySelector('h1').textContent = project.name;
  document.title = `${project.name} — Workboard`;
}

try {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  showError(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
