const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
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
  button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
  row.append(name, button);
  return row;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button type="button" id="back" class="secondary">Projects</button><h1></h1><p id="error" role="alert" hidden></p>';
    document.querySelector('#back').addEventListener('click', () => { location.href = '/'; });
    const project = await request(`/api/projects/${match[1]}`);
    document.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
  } else {
    app.innerHTML = `
      <h1>Workboard</h1>
      <p class="intro">A place for your projects.</p>
      <form id="create-project" novalidate>
        <label for="project-name">Project name</label>
        <div class="form-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <p id="error" role="alert" hidden></p>
      <h2>Projects</h2>
      <p id="empty" hidden>No projects yet. Create one to get started.</p>
      <ul id="projects" aria-label="Projects"></ul>`;
    const projects = await request('/api/projects');
    const list = document.querySelector('#projects');
    list.append(...projects.map(projectRow));
    document.querySelector('#empty').hidden = projects.length !== 0;
    document.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#project-name');
      const name = input.value.trim();
      document.querySelector('#error').hidden = true;
      if (!name) { showError('Project name is required'); input.focus(); return; }
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      try {
        const project = await request('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        list.append(projectRow(project));
        document.querySelector('#empty').hidden = true;
        input.value = '';
        input.focus();
      } catch (error) { showError(error.message); }
      finally { button.disabled = false; }
    });
  }
}

render().catch(error => {
  if (!document.querySelector('#error')) app.innerHTML = '<p id="error" role="alert"></p>';
  showError(error.message);
}).finally(() => app.setAttribute('aria-busy', 'false'));
