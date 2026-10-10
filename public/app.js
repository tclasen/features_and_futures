const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete request');
  return result;
}

function alertMessage(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = !message;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
}

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.textContent = 'Open project';
  button.addEventListener('click', () => navigate(`/projects/${project.id}`));
  row.append(name, button);
  return row;
}

async function render() {
  const path = location.pathname;
  app.setAttribute('aria-busy', 'true');
  const match = path.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button id="projects">Projects</button><h1></h1><p role="alert" hidden></p>';
    app.querySelector('#projects').addEventListener('click', () => navigate('/'));
    try {
      const project = await request(`/api/projects/${match[1]}`);
      if (location.pathname !== path) return;
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      if (location.pathname === path) alertMessage(error.message);
    }
  } else {
    document.title = 'Workboard';
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
      <ul id="project-list" aria-label="Projects"></ul>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const list = app.querySelector('ul');
    const submit = form.querySelector('button');
    // Wait for the initial list before allowing creation, keeping creation order stable.
    submit.disabled = true;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        alertMessage('Project name is required');
        input.focus();
        return;
      }
      submit.disabled = true;
      alertMessage('');
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
        if (form.isConnected) alertMessage(error.message);
      } finally {
        submit.disabled = false;
      }
    });
    try {
      const projects = await request('/api/projects');
      if (!list.isConnected) return;
      list.replaceChildren(...projects.map(projectRow));
    } catch (error) {
      if (list.isConnected) alertMessage(error.message);
    } finally {
      submit.disabled = false;
    }
  }
  if (location.pathname === path) app.setAttribute('aria-busy', 'false');
}

window.addEventListener('popstate', render);
render();
