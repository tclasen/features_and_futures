const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (match) {
    try {
      const projects = await request('/api/projects');
      const project = projects.find(item => item.id === decodeURIComponent(match[1]));
      if (project) {
        app.innerHTML = `<button class="back" id="back">Projects</button><h1>${escapeHtml(project.name)}</h1>`;
        document.querySelector('#back').addEventListener('click', () => navigate('/'));
        return;
      }
    } catch { /* Render the list if project lookup is unavailable. */ }
  }
  app.innerHTML = `<h1>Workboard</h1>
    <form id="create-form"><label for="project-name">Project name</label><div class="create-line"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div></form>
    <p id="alert" class="alert" role="alert" hidden></p><section id="projects" aria-label="Projects"></section>`;
  document.querySelector('#create-form').addEventListener('submit', createProject);
  await loadProjects();
}

async function loadProjects() {
  const projects = await request('/api/projects');
  const list = document.querySelector('#projects');
  list.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.textContent = 'Open project';
    button.addEventListener('click', () => navigate(`/projects/${encodeURIComponent(project.id)}`));
    row.append(name, button);
    list.append(row);
  }
}

async function createProject(event) {
  event.preventDefault();
  const input = document.querySelector('#project-name');
  const alert = document.querySelector('#alert');
  const name = input.value.trim();
  if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
  alert.hidden = true;
  try {
    await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    input.value = '';
    await loadProjects();
  } catch (error) { alert.textContent = error.message; alert.hidden = false; }
}

function navigate(path) { history.pushState({}, '', path); render(); }
function escapeHtml(value) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
window.addEventListener('popstate', render);
render().catch(error => { app.innerHTML = `<h1>Workboard</h1><p role="alert">${escapeHtml(error.message)}</p>`; });
