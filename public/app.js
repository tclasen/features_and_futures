const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
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
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  row.append(name, button);
  return row;
}

async function render() {
  const projectMatch = location.pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch) {
    app.innerHTML = '<button type="button" id="projects">Projects</button>';
    document.querySelector('#projects').addEventListener('click', () => location.assign('/'));
    const project = await api(`/api/projects/${projectMatch[1]}`);
    const heading = document.createElement('h1');
    heading.textContent = project.name;
    app.prepend(heading);
    document.title = `${project.name} · Workboard`;
    return;
  }

  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="create-project">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <ul aria-label="Projects"></ul>`;
  const list = app.querySelector('ul');
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const submit = form.querySelector('button');
  submit.disabled = true;
  const projects = await api('/api/projects');
  list.append(...projects.map(projectRow));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    if (!input.value.trim()) {
      showError('Project name is required');
      input.focus();
      return;
    }
    submit.disabled = true;
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
  submit.disabled = false;
}

render().catch((error) => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
