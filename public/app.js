const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
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
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
  return row;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button id="projects" type="button">Projects</button><h1 id="name">Loading project…</h1><p id="error" role="alert" hidden></p>';
    document.querySelector('#projects').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await request(`/api/projects/${match[1]}`);
      document.querySelector('#name').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      document.querySelector('#name').textContent = 'Project unavailable';
      showError(error.message);
    }
  } else {
    app.innerHTML = `
      <h1>Workboard</h1>
      <form id="create-project">
        <label for="project-name">Project name</label>
        <div class="form-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <p id="error" role="alert" hidden></p>
      <h2>Projects</h2>
      <p id="empty" hidden>No projects yet. Create a project to get started.</p>
      <ul id="project-list" aria-label="Projects"></ul>`;
    const form = document.querySelector('#create-project');
    const input = document.querySelector('#project-name');
    const list = document.querySelector('#project-list');
    const empty = document.querySelector('#empty');
    const submit = form.querySelector('button');
    submit.disabled = true;
    try {
      const projects = await request('/api/projects');
      list.replaceChildren(...projects.map(projectRow));
      empty.hidden = projects.length > 0;
      submit.disabled = false;
    } catch (error) { showError(error.message); }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) { showError('Project name is required'); input.focus(); return; }
      submit.disabled = true;
      document.querySelector('#error').hidden = true;
      try {
        const project = await request('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        list.append(projectRow(project));
        empty.hidden = true;
        input.value = '';
        input.focus();
      } catch (error) { showError(error.message); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
