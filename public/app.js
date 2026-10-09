const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function renderProjects(errorMessage = '') {
  const projects = await request('/api/projects');
  app.innerHTML = `
    <h1>Workboard</h1>
    <form id="create-project">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Create project</button>
    </form>
    <p id="form-error" role="alert">${escapeHtml(errorMessage)}</p>
    <section aria-label="Projects">
      ${projects.map((project) => `
        <div data-testid="project-row" class="project-row">
          <span>${escapeHtml(project.name)}</span>
          <button type="button" data-project-id="${project.id}">Open project</button>
        </div>`).join('')}
    </section>`;

  app.querySelector('#create-project').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = app.querySelector('#project-name');
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      await renderProjects();
    } catch (error) {
      app.querySelector('#form-error').textContent = error.message;
    }
  });
  app.querySelectorAll('[data-project-id]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.href = `/projects/${button.dataset.projectId}`;
    });
  });
}

async function renderProject(projectId) {
  const project = await request(`/api/projects/${projectId}`);
  app.innerHTML = `
    <button type="button" id="back-to-projects">Projects</button>
    <h1>${escapeHtml(project.name)}</h1>`;
  app.querySelector('#back-to-projects').addEventListener('click', () => {
    window.location.href = '/';
  });
}

try {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await renderProject(match[1]);
  else await renderProjects();
} catch {
  app.innerHTML = '<h1>Workboard</h1><p role="alert">Unable to load this page.</p><a href="/">Projects</a>';
}
