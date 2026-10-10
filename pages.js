function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectsPage(projects, error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="post" action="/projects" class="create-form">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <section aria-label="Projects" class="projects">
      ${projects.length ? projects.map((project) => `
        <div data-testid="project-row" class="project-row">
          <span>${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('') : '<p class="empty">No projects yet.</p>'}
    </section>`);
}

export function projectPage(project) {
  return page(project.name, `
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>`);
}

export function notFoundPage() {
  return page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>');
}
