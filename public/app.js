const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Unable to complete the request');
  return body;
}

function showError(container, error) {
  let alert = container.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    container.append(alert);
  }
  alert.textContent = error.message;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  row.append(name, open);
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
    <section aria-label="Projects" id="projects"></section>`;
  const form = app.querySelector('form');
  const input = form.elements.name;
  const button = form.querySelector('button');
  const projects = app.querySelector('#projects');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.querySelector('[role="alert"]')?.remove();
    const name = input.value.trim();
    if (!name) {
      showError(form, new Error('Project name is required'));
      return;
    }
    button.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = false;
    }
  });
  // Load existing rows before accepting new ones to preserve creation order.
  button.disabled = true;
  try {
    const existing = await api('/api/projects');
    projects.replaceChildren(...existing.map(projectRow));
  } catch (error) {
    showError(app, error);
  } finally {
    button.disabled = false;
  }
}

async function renderProject(id) {
  const back = document.createElement('button');
  back.textContent = 'Projects';
  back.addEventListener('click', () => window.location.assign('/'));
  app.replaceChildren(back);
  try {
    const project = await api(`/api/projects/${id}`);
    const heading = document.createElement('h1');
    heading.textContent = project.name;
    app.prepend(heading);
    document.title = `${project.name} · Workboard`;
  } catch (error) {
    showError(app, error);
  }
}

const projectMatch = /^\/projects\/([1-9]\d*)$/.exec(window.location.pathname);
if (projectMatch) {
  await renderProject(projectMatch[1]);
} else {
  await renderProjects();
}
