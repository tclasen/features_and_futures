const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Unable to complete request');
  return value;
}

function showAlert(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
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
    <p role="alert"></p>
    <ul aria-label="Projects"></ul>
  `;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const button = form.querySelector('button');
  const list = app.querySelector('ul');
  // Load first so submissions cannot race the initial list render.
  button.disabled = true;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const name = input.value.trim();
    if (!name) return showAlert('Project name is required');
    button.disabled = true;
    showAlert('');
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
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });
  try {
    const projects = await api('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
  } finally {
    button.disabled = false;
  }
}

async function showProject(id) {
  const back = document.createElement('button');
  back.textContent = 'Projects';
  back.type = 'button';
  back.addEventListener('click', () => location.assign('/'));
  app.append(back);
  const project = await api(`/api/projects/${id}`);
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  app.prepend(heading);
  document.title = `${project.name} — Workboard`;
}

try {
  const match = location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  showAlert(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
