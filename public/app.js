const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showAlert(message) {
  const alert = document.querySelector('#alert');
  alert.textContent = message;
  alert.hidden = !message;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
  row.append(name, open);
  return row;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button id="back">Projects</button><h1></h1><p id="alert" role="alert" hidden></p>';
    document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await api(`/api/projects/${match[1]}`);
      document.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
    } catch (error) { showAlert(error.message); }
    return;
  }

  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p id="alert" role="alert" hidden></p>
    <section aria-label="Projects" id="projects"></section>`;
  const list = document.querySelector('#projects');
  const form = document.querySelector('form');
  const input = document.querySelector('#project-name');
  const submit = form.querySelector('button');
  // Register creation only after loading existing projects to preserve row order.
  submit.disabled = true;
  try {
    const projects = await api('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
    submit.disabled = false;
  } catch (error) { showAlert(error.message); }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const name = input.value.trim();
    if (!name) { showAlert('Project name is required'); return; }
    showAlert('');
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = false; }
  });
}

render();
