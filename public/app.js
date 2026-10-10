const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete the request');
  return data;
}

function showAlert(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = !message;
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
  open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
  row.append(name, open);
  app.querySelector('#projects').append(row);
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    app.innerHTML = '<button id="back" type="button">Projects</button><h1></h1><p role="alert" hidden></p>';
    app.querySelector('#back').addEventListener('click', () => { location.href = '/'; });
    const project = await request(`/api/projects/${match[1]}`);
    app.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
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
    <p role="alert" hidden></p>
    <section id="projects" aria-label="Projects"></section>`;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const button = form.querySelector('button');
  // Attach creation only after the initial list loads to preserve visible order.
  button.disabled = true;
  const projects = await request('/api/projects');
  projects.forEach(addProjectRow);
  button.disabled = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showAlert('');
    if (!input.value.trim()) {
      showAlert('Project name is required');
      input.focus();
      return;
    }
    button.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      addProjectRow(project);
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });
}

render().catch((error) => showAlert(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
