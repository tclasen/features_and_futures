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
    body { margin: 0; background: #f4f6fa; color: #19283b; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 12px; font: inherit; border: 1px solid #78869a; border-radius: 6px; }
    button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #2457ad; border: 0; border-radius: 6px; cursor: pointer; }
    button:hover { background: #194186; }
    :focus-visible { outline: 3px solid #df9200; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { padding: 0; list-style: none; margin-top: 28px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #d8dfeb; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a02222; padding: 12px; background: #fff0f0; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function renderProjects(projects, error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <ul class="projects">${projects.map((project) => `
      <li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form action="/projects/${escapeHtml(project.id)}" method="get">
          <button type="submit">Open project</button>
        </form>
      </li>`).join('')}
    </ul>`);
}

export function renderProject(project) {
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>`);
}

export function renderNotFound() {
  return page('Not found', '<h1>Not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>');
}
