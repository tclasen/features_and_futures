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

export function projectsPage(projects, error = '', submittedName = '') {
  return page('Projects', `
    <p class="eyebrow">YOUR WORK, ORGANIZED</p>
    <h1>Workboard</h1>
    <form class="create-form" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" value="${escapeHtml(submittedName)}">
        <button type="submit">Create project</button>
      </div>
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <section aria-label="Projects" class="project-list">
      ${projects.length ? projects.map((project) => `
        <article class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get">
            <button class="secondary" type="submit">Open project</button>
          </form>
        </article>`).join('') : '<p class="empty">No projects yet. Create a project to get started.</p>'}
    </section>`);
}

export function projectPage(project) {
  return page(project.name, `
    <form action="/" method="get"><button class="secondary" type="submit">Projects</button></form>
    <p class="eyebrow detail-label">PROJECT</p>
    <h1>${escapeHtml(project.name)}</h1>`);
}

export function notFoundPage() {
  return page('Page not found', '<h1>Page not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>');
}
