const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function showAlert(message) {
  const alert = document.querySelector('#error');
  alert.textContent = message;
  alert.hidden = !message;
}

function appendProject(project) {
  const row = document.createElement('li');
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

async function renderList() {
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
    <ul id="projects" aria-label="Projects"></ul>`;
  const projects = await api('/api/projects');
  projects.forEach(appendProject);
  document.querySelector('#create-project').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#project-name');
    const name = input.value.trim();
    showAlert('');
    if (!name) return showAlert('Project name is required');
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      appendProject(project);
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  });
}

async function renderProject(id) {
  app.innerHTML = '<button id="back" type="button">Projects</button><h1></h1><p id="error" role="alert" hidden></p>';
  document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
  const project = await api(`/api/projects/${id}`);
  document.querySelector('h1').textContent = project.name;
  document.title = `${project.name} — Workboard`;
}

try {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await renderProject(match[1]);
  else await renderList();
} catch (error) {
  showAlert(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
