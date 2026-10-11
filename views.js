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
    body { margin: 0; background: #f5f7fa; color: #172334; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { overflow-wrap: anywhere; font-size: 36px; margin: 0 0 32px; }
    .create-form { background: white; padding: 24px; border: 1px solid #d7dfe8; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .form-controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8996a8; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { border: 1px solid #285ad1; border-radius: 6px; background: #285ad1; color: white; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #204bad; }
    :focus-visible { outline: 3px solid #ad6c00; outline-offset: 3px; }
    [role="alert"] { color: #a21b25; margin: 0 0 16px; }
    .projects { margin-top: 24px; display: grid; gap: 12px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: white; border: 1px solid #d7dfe8; border-radius: 10px; padding: 18px 24px; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    @media (max-width: 520px) { main { margin-top: 32px; } .form-controls { flex-direction: column; } .project-row { padding: 16px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectListPage(projects, error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create-form" method="post" action="/projects">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    <div class="projects">
      ${projects.map((project) => `<div class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </div>`).join('')}
    </div>`);
}

export function projectPage(project) {
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>`);
}
