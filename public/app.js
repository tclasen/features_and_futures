const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load projects');
  return body;
}

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  row.append(name, open);
  return row;
}

async function showProjects() {
  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p role="alert" id="error" hidden></p>
    <ul aria-label="Projects" id="projects"></ul>
  `;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const error = app.querySelector('#error');
  const list = app.querySelector('#projects');
  const submit = form.querySelector('button');
  const projects = await api('/api/projects');
  list.replaceChildren(...projects.map(projectRow));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Project name is required';
      error.hidden = false;
      return;
    }
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
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

async function showProject(id) {
  app.replaceChildren();
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => window.location.assign('/'));
  app.append(back);
  const project = await api(`/api/projects/${id}`);
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  app.append(heading);
  document.title = `${project.name} — Workboard`;
}

try {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (failure) {
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.textContent = failure.message;
  app.append(alert);
} finally {
  app.setAttribute('aria-busy', 'false');
}
