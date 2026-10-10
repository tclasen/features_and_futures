const app = document.querySelector('#app');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function projectIdFromPath() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

async function render() {
  const projects = await getProjects();
  const projectId = projectIdFromPath();
  if (projectId !== null) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      app.innerHTML = '<h1>Project not found</h1><button type="button" id="back">Projects</button>';
      document.querySelector('#back').addEventListener('click', () => navigate('/'));
      return;
    }
    app.innerHTML = `<button type="button" id="back">Projects</button><h1>${escapeHtml(project.name)}</h1>`;
    document.querySelector('#back').addEventListener('click', () => navigate('/'));
    return;
  }

  app.innerHTML = `<h1>Workboard</h1>
    <form id="create-form">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Create project</button>
      <p id="error" role="alert" hidden></p>
    </form>
    <section id="projects" aria-label="Projects">${projects.map((project) => `
      <div data-testid="project-row" class="project-row">
        <span>${escapeHtml(project.name)}</span>
        <button type="button" data-project-id="${project.id}">Open project</button>
      </div>`).join('')}
    </section>`;

  document.querySelector('#create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#project-name');
    const error = document.querySelector('#error');
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Project name is required';
      error.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const result = await response.json();
      error.textContent = result.error ?? 'Could not create project';
      error.hidden = false;
      return;
    }
    navigate('/');
  });
  document.querySelectorAll('[data-project-id]').forEach((button) => {
    button.addEventListener('click', () => navigate(`/projects/${button.dataset.projectId}`));
  });
}

function navigate(path) {
  history.pushState({}, '', path);
  render().catch(showError);
}

function showError(error) {
  app.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p>`;
}

window.addEventListener('popstate', () => render().catch(showError));
render().catch(showError);
