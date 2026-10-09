const app = document.querySelector('#app');
const alertBox = document.querySelector('#alert');

function projectUrl(id) {
  return `/projects/${encodeURIComponent(id)}`;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  return response.json();
}

function renderList(projects) {
  app.innerHTML = `<h1>Workboard</h1>
    <form id="project-form">
      <label for="project-name">Project name</label>
      <div class="form-row"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <p id="alert" role="alert" hidden></p><section aria-label="Projects"><div id="projects" class="project-list"></div></section>`;
  const list = app.querySelector('#projects');
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { history.pushState({}, '', projectUrl(project.id)); renderRoute(); });
    row.append(name, open);
    list.append(row);
  }
  app.querySelector('#project-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = app.querySelector('#project-name');
    const name = input.value.trim();
    const alert = app.querySelector('#alert');
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    history.pushState({}, '', '/');
    renderRoute();
  });
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    renderList(await loadProjects());
    return;
  }
  const response = await fetch(`/api/projects/${match[1]}`);
  if (!response.ok) {
    history.replaceState({}, '', '/');
    return renderRoute();
  }
  const project = await response.json();
  app.replaceChildren();
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { history.pushState({}, '', '/'); renderRoute(); });
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  app.append(back, heading);
}

window.addEventListener('popstate', () => renderRoute());
renderRoute().catch(error => { app.textContent = error.message; });
