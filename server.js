import { createServer } from 'node:http';
import { openProjects } from './projects.js';

const projects = openProjects(process.env.DB_PATH || 'data/workboard.sqlite');
const port = Number(process.env.PORT || 8080);

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
    :root { font-family: system-ui, sans-serif; color: #172b40; background: #f3f6fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border-radius: 16px; box-shadow: 0 8px 32px #172b4010; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8192a5; border-radius: 6px; padding: 12px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 12px 18px; background: #205bc4; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #17489e; }
    :focus-visible { outline: 3px solid #dc8b00; outline-offset: 3px; }
    [role="alert"] { color: #a02020; margin: 16px 0; }
    .projects { margin-top: 28px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce3ec; padding: 18px 0; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .empty { color: #536578; }
    @media (max-width: 600px) { main { margin: 16px; padding: 24px; } .create { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const rows = projects.list().map((project) => `
    <div class="project" data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <div class="projects">${rows || '<p class="empty">No projects yet.</p>'}</div>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectList());
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 16384) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const project = projects.create(new URLSearchParams(body).get('name'));
      if (!project) {
        sendHtml(response, 422, projectList('Project name is required'));
        return;
      }
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      if (project) {
        sendHtml(response, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button type="submit">Projects</button></form>`));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Server error', '<h1>Unable to complete your request</h1>'));
    else response.end();
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on port ${server.address().port}`));

function shutdown() {
  server.close(() => {
    projects.close();
    process.exit(0);
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
