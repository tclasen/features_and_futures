const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function showError(message) {
  const alert = document.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = false;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.textContent = 'Open project';
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, button);
  return row;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button id="projects">Projects</button><h1></h1><p role="alert" hidden></p>';
    document.querySelector('#projects').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await request(`/api/projects/${match[1]}`);
      document.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
    } catch (error) { showError(error.message); }
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
      <p role="alert" hidden></p>
      <section aria-label="Projects" id="project-list"></section>`;
    const list = document.querySelector('#project-list');
    const form = document.querySelector('form');
    const input = document.querySelector('#project-name');
    const submit = form.querySelector('button');
    // Load the initial list before allowing writes, preserving creation order.
    submit.disabled = true;
    try {
      const projects = await request('/api/projects');
      list.replaceChildren(...projects.map(projectRow));
    } catch (error) { showError(error.message); }
    submit.disabled = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return showError('Project name is required');
      submit.disabled = true;
      try {
        const project = await request('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        list.append(projectRow(project));
        input.value = '';
        document.querySelector('[role="alert"]').hidden = true;
        input.focus();
      } catch (error) { showError(error.message); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
