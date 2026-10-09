const app = document.querySelector('#app');

async function api(path, options) {
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
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  row.append(name, open);
  return row;
}

async function render() {
  const projectRoute = location.pathname.match(/^\/projects\/(\d+)$/);
  if (projectRoute) {
    app.innerHTML = '<button id="projects" type="button">Projects</button><h1></h1><p role="alert" hidden></p>';
    document.querySelector('#projects').addEventListener('click', () => location.assign('/'));
    try {
      const project = await api(`/api/projects/${projectRoute[1]}`);
      document.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      document.querySelector('h1').textContent = 'Project unavailable';
      showError(error.message);
    }
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
      <section aria-label="Projects" id="project-list"></section>
    `;
    const list = document.querySelector('#project-list');
    const form = document.querySelector('form');
    const input = document.querySelector('#project-name');
    const submit = form.querySelector('button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.value.trim()) {
        showError('Project name is required');
        return;
      }
      submit.disabled = true;
      document.querySelector('[role="alert"]').hidden = true;
      try {
        const project = await api('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.value }),
        });
        list.append(projectRow(project));
        input.value = '';
        input.focus();
      } catch (error) {
        showError(error.message);
      } finally {
        submit.disabled = false;
      }
    });
    submit.disabled = true;
    try {
      const projects = await api('/api/projects');
      list.replaceChildren(...projects.map(projectRow));
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  }
  app.setAttribute('aria-busy', 'false');
}

render();
