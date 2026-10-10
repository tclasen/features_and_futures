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
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #192b3b; background: #f3f6fa; }
    body { margin: 0; }
    main { max-width: 720px; margin: 3rem auto; padding: 2rem; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: .5rem; }
    input { box-sizing: border-box; width: 100%; padding: .75rem; border: 1px solid #65788a; border-radius: 5px; font: inherit; }
    button { border: 0; border-radius: 5px; padding: .7rem 1rem; background: #245bc2; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #194597; }
    input:focus-visible, button:focus-visible { outline: 3px solid #dd9800; outline-offset: 3px; }
    .create button { margin-top: .75rem; }
    .projects { margin-top: 2rem; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 0; border-top: 1px solid #d6dee7; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a01717; margin: 1rem 0; }
    @media (max-width: 600px) { main { margin: 1rem; padding: 1.25rem; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function renderProjects(projects, error = '') {
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map((project) => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      </div>`).join('')}
    </section>`);
}

export function renderProject(project) {
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>`);
}

export function renderNotFound() {
  return page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>');
}
