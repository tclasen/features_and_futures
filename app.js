const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    body { margin: 0; background: #f4f6fa; color: #172238; font: 1rem system-ui, sans-serif; }
    main { max-width: 48rem; margin: 3rem auto; padding: 0 1.5rem; }
    h1 { font-size: 2rem; }
    label { display: block; font-weight: 600; margin-bottom: .5rem; }
    input, button { font: inherit; padding: .7rem 1rem; border-radius: .4rem; }
    input { border: 1px solid #6b7280; max-width: 100%; box-sizing: border-box; }
    button { background: #244fbc; color: white; border: 0; cursor: pointer; }
    button:hover { background: #193b93; }
    :focus-visible { outline: 3px solid #b45309; outline-offset: 3px; }
    .create { display: flex; flex-wrap: wrap; gap: .75rem; }
    ul { list-style: none; padding: 0; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: 1rem; background: white; border: 1px solid #d4dae5; border-radius: .5rem; margin: .75rem 0; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    [role="alert"] { color: #a31919; font-weight: 600; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(projects, error = '', name = '') {
  const rows = projects.list().map((project) => `
    <li data-testid="project-row"><span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    </li>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" value="${escapeHtml(name)}">
      <button type="submit">Create project</button></div>
    </form>
    <h2>Projects</h2>
    ${rows ? `<ul>${rows}</ul>` : '<p>No projects yet.</p>'}`);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function createHandler(projects) {
  return async (request, response) => {
    const send = (status, body, contentType = 'text/html; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && pathname === '/health') {
        send(200, JSON.stringify({ status: 'ok' }), 'application/json');
      } else if (request.method === 'GET' && pathname === '/') {
        send(200, projectList(projects));
      } else if (request.method === 'POST' && pathname === '/projects') {
        const form = await readForm(request);
        const name = form.get('name') ?? '';
        if (!name.trim()) {
          send(400, projectList(projects, 'Project name is required', name));
          return;
        }
        projects.create(name);
        response.writeHead(303, { Location: '/' });
        response.end();
      } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? projects.find(id) : undefined;
        if (!project) {
          send(404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
          return;
        }
        send(200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button type="submit">Projects</button></form>`));
      } else {
        send(404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
      }
    } catch (error) {
      if (!error.status) console.error(error);
      send(error.status ?? 500, page('Error', '<h1>Unable to complete request</h1><a href="/">Projects</a>'));
    }
  };
}
