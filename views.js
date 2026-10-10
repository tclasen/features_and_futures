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
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #192537; font-family: system-ui, sans-serif; }
    main { max-width: 720px; margin: 64px auto; padding: 28px; background: white; border: 1px solid #dde3eb; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 11px; font: inherit; border: 1px solid #66768a; border-radius: 5px; }
    button { padding: 10px 16px; border: 0; border-radius: 5px; background: #2456bd; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #194493; }
    :focus-visible { outline: 3px solid #9c6200; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { margin-top: 28px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dde3eb; padding: 16px 0; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #9c2020; }
    @media (max-width: 760px) { main { margin: 24px 12px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectsPage(projects, error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map((project) => `
        <div class="project-row" data-testid="project-row">
          <span>${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('')}
    </section>`);
}

export function projectPage(project) {
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>`);
}

export function notFoundPage() {
  return page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>');
}
