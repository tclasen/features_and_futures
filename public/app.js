const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function showError(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = false;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
}

function addProjectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => navigate(`/projects/${project.id}`));
  row.append(name, button);
  app.querySelector('#projects').append(row);
  app.querySelector('#empty').hidden = true;
}

let renderVersion = 0;
async function render() {
  const version = ++renderVersion;
  const match = location.pathname.match(/^\/projects\/([^/]+)$/);
  app.setAttribute('aria-busy', 'true');
  if (match) {
    app.innerHTML = '<button type="button" id="back">Projects</button><h1>Loading project…</h1><p role="alert" hidden></p>';
    app.querySelector('#back').addEventListener('click', () => navigate('/'));
    try {
      const project = await request(`/api/projects/${match[1]}`);
      if (version !== renderVersion) return;
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      if (version !== renderVersion) return;
      app.querySelector('h1').textContent = 'Project unavailable';
      showError(error.message);
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
      <h2>Projects</h2>
      <p id="empty" hidden>No projects yet. Create your first project above.</p>
      <ul id="projects" aria-label="Projects"></ul>`;
    const form = app.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      if (button.disabled) return;
      const input = form.elements.name;
      const name = input.value.trim();
      if (!name) return showError('Project name is required');
      button.disabled = true;
      app.querySelector('[role="alert"]').hidden = true;
      try {
        const project = await request('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
        });
        if (version !== renderVersion) return;
        addProjectRow(project);
        input.value = '';
        input.focus();
      } catch (error) {
        if (version === renderVersion) showError(error.message);
      } finally {
        button.disabled = false;
      }
    });
    // Finish loading the initial list before allowing creation, preserving row order.
    const createButton = form.querySelector('button');
    createButton.disabled = true;
    try {
      const projects = await request('/api/projects');
      if (version !== renderVersion) return;
      projects.forEach(addProjectRow);
      app.querySelector('#empty').hidden = projects.length > 0;
    } catch (error) {
      if (version !== renderVersion) return;
      showError(error.message);
    }
    createButton.disabled = false;
  }
  app.setAttribute('aria-busy', 'false');
}

window.addEventListener('popstate', render);
render();
