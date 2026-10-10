const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load projects');
  return body;
}

function showError(container, message) {
  container.textContent = message;
  container.hidden = false;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    app.innerHTML = '<button id="back" type="button">Projects</button><h1>Loading project…</h1><p role="alert" hidden></p>';
    document.querySelector('#back').addEventListener('click', () => location.assign('/'));
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
    } catch (error) {
      app.querySelector('h1').textContent = 'Project unavailable';
      showError(app.querySelector('[role="alert"]'), error.message);
    }
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
    <section aria-label="Projects" id="projects"></section>
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
    button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
    row.append(name, button);
    list.append(row);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!input.value.trim()) {
      showError(alert, 'Project name is required');
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      appendProject(project);
      input.value = '';
      input.focus();
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = false;
    }
  });

  form.querySelector('button').disabled = true;
  try {
    (await request('/api/projects')).forEach(appendProject);
  } catch (error) {
    showError(alert, error.message);
  } finally {
    form.querySelector('button').disabled = false;
  }
}

render();
