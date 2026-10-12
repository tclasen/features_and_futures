const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(container, message) {
  container.textContent = message;
  container.hidden = false;
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
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button type="button" id="projects">Projects</button><h1></h1><p role="alert" hidden></p>';
    app.querySelector('#projects').addEventListener('click', () => location.assign('/'));
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (error) {
      showError(app.querySelector('[role="alert"]'), error.message);
    }
  } else {
    app.innerHTML = `
      <h1>Workboard</h1>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-fields">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <p role="alert" hidden></p>
      <section aria-label="Projects" id="project-list"></section>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const alert = app.querySelector('[role="alert"]');
    const list = app.querySelector('#project-list');
    // Load the existing rows before accepting creations to preserve their order.
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const projects = await request('/api/projects');
      list.append(...projects.map(projectRow));
    } catch (error) {
      showError(alert, error.message);
      return;
    } finally {
      app.setAttribute('aria-busy', 'false');
    }
    button.disabled = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        showError(alert, 'Project name is required');
        input.focus();
        return;
      }
      button.disabled = true;
      alert.hidden = true;
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
        showError(alert, error.message);
      } finally {
        button.disabled = false;
      }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
