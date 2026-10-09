const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load projects');
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
  open.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  row.append(name, open);
  return row;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button id="projects" type="button">Projects</button><h1></h1><p id="error" role="alert" hidden></p>';
    document.querySelector('#projects').addEventListener('click', () => window.location.assign('/'));
    const project = await request(`/api/projects/${match[1]}`);
    document.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    return;
  }
  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p id="error" role="alert" hidden></p>
    <ul id="project-list" aria-label="Projects"></ul>
  `;
  const list = document.querySelector('#project-list');
  const projects = await request('/api/projects');
  list.append(...projects.map(projectRow));
  document.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#project-name');
    const name = input.value.trim();
    document.querySelector('#error').hidden = true;
    if (!name) return showError('Project name is required');
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const project = await request('/api/projects', {
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
      button.disabled = false;
    }
  });
}

render().catch((error) => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
