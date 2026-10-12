const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showError(error) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = error.message;
}

function appendProject(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, button);
  app.querySelector('#projects').append(row);
  app.querySelector('#empty').hidden = true;
}

async function render() {
  const projectPath = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (projectPath) {
    app.innerHTML = '<button type="button" id="back">Projects</button><h1>Loading project…</h1>';
    app.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await request(`/api/projects/${projectPath[1]}`);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      app.querySelector('h1').textContent = 'Project unavailable';
      showError(error);
    }
  } else {
    app.innerHTML = `
      <h1>Workboard</h1>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <h2>Projects</h2>
      <p id="empty">No projects yet.</p>
      <ul id="projects" aria-label="Projects"></ul>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    // Register after loading so creations always follow the persisted rows.
    try {
      submit.disabled = true;
      const projects = await request('/api/projects');
      projects.forEach(appendProject);
    } catch (error) { showError(error); }
    finally { submit.disabled = false; }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      app.querySelector('[role="alert"]')?.remove();
      if (!input.value.trim()) return showError(new Error('Project name is required'));
      submit.disabled = true;
      try {
        const project = await request('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.value }),
        });
        appendProject(project);
        input.value = '';
        input.focus();
      } catch (error) { showError(error); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
