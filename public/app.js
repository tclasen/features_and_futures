const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
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
  open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
  row.append(name, open);
  return row;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const project = await request(`/api/projects/${match[1]}`);
    const heading = document.createElement('h1');
    heading.textContent = project.name;
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Projects';
    back.addEventListener('click', () => { location.href = '/'; });
    app.replaceChildren(heading, back);
  } else {
    const projects = await request('/api/projects');
    app.innerHTML = `
      <h1>Workboard</h1>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <section aria-label="Projects" id="projects"></section>
    `;
    const list = app.querySelector('#projects');
    list.append(...projects.map(projectRow));
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      app.querySelector('[role="alert"]')?.remove();
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
        input.focus();
      } catch (error) {
        showError(error.message);
      } finally {
        submit.disabled = false;
      }
    });
  }
}

render().catch((error) => {
  app.replaceChildren();
  showError(error.message);
}).finally(() => app.setAttribute('aria-busy', 'false'));
