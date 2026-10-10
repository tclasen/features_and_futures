const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
}

async function renderProjects() {
  document.title = 'Workboard';
  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit" disabled>Create project</button>
      </div>
    </form>
    <p role="alert" hidden></p>
    <div id="projects"></div>
  `;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const alert = app.querySelector('[role="alert"]');
  const list = app.querySelector('#projects');
  function appendProject(project) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(name, button);
    list.append(row);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      appendProject(project);
      input.value = '';
      input.focus();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  try {
    const projects = await request('/api/projects');
    projects.forEach(appendProject);
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  } finally {
    form.querySelector('button').disabled = false;
  }
}

async function renderProject(id) {
  app.innerHTML = '<button type="button">Projects</button><h1>Loading project…</h1>';
  app.querySelector('button').addEventListener('click', () => { window.location.href = '/'; });
  try {
    const project = await request(`/api/projects/${id}`);
    app.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
  } catch (error) {
    app.querySelector('h1').textContent = 'Project unavailable';
    showError(error.message);
  }
}

const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
if (match) renderProject(match[1]);
else renderProjects();
