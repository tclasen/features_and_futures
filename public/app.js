const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  const alert = document.querySelector('#error');
  alert.textContent = message;
  alert.hidden = false;
}

function addProjectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
  document.querySelector('#projects').append(row);
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button id="back" type="button">Projects</button><h1>Loading project…</h1><p id="error" role="alert" hidden></p>';
    document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await api(`/api/projects/${match[1]}`);
      document.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      document.querySelector('h1').textContent = 'Project unavailable';
      showError(error.message);
    }
  } else {
    app.innerHTML = `<h1>Workboard</h1>
      <form id="create-project">
        <label for="project-name">Project name</label>
        <div class="create-controls"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
      </form>
      <p id="error" role="alert" hidden></p>
      <div id="projects" aria-label="Projects"></div>`;
    const form = document.querySelector('form');
    const input = document.querySelector('input');
    const submit = form.querySelector('button');
    // Fetch existing rows before enabling creation to preserve creation order.
    submit.disabled = true;
    try {
      const projects = await api('/api/projects');
      projects.forEach(addProjectRow);
      submit.disabled = false;
    } catch (error) { showError(error.message); }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      const name = input.value.trim();
      if (!name) return showError('Project name is required');
      submit.disabled = true;
      document.querySelector('#error').hidden = true;
      try {
        const project = await api('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
        });
        addProjectRow(project);
        input.value = '';
        input.focus();
      } catch (error) { showError(error.message); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
