const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load projects');
  return body;
}

function showError(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = !message;
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

async function renderProjects() {
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
    <ul class="projects" aria-label="Projects"></ul>
    <p class="empty" hidden>No projects yet. Create a project to get started.</p>
  `;
  const list = app.querySelector('.projects');
  const empty = app.querySelector('.empty');
  const form = app.querySelector('form');
  const input = form.elements.name;
  const submit = form.querySelector('button');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    submit.disabled = true;
    showError('');
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      empty.hidden = true;
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  // Finish the initial load before allowing creation, preserving creation order.
  submit.disabled = true;
  try {
    const projects = await api('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
    empty.hidden = projects.length > 0;
  } finally {
    submit.disabled = false;
  }
}

async function renderProject(id) {
  app.innerHTML = `
    <button type="button" id="projects">Projects</button>
    <h1>Loading project…</h1>
    <p role="alert" hidden></p>
  `;
  app.querySelector('#projects').addEventListener('click', () => {
    window.location.assign('/');
  });
  const project = await api(`/api/projects/${id}`);
  app.querySelector('h1').textContent = project.name;
  document.title = `${project.name} · Workboard`;
}

try {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await renderProject(match[1]);
  else await renderProjects();
} catch (error) {
  showError(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
