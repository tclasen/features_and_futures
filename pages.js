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
    <title>${escapeHtml(title)} | Workboard</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f5f7fa; color: #182332; font: 1rem/1.5 system-ui, sans-serif; }
      main { max-width: 760px; margin: 3rem auto; padding: 0 1.25rem; }
      h1 { overflow-wrap: anywhere; }
      label { display: block; font-weight: 600; margin-bottom: .4rem; }
      input { width: 100%; padding: .7rem; border: 1px solid #66758a; border-radius: .35rem; font: inherit; }
      button { padding: .65rem 1rem; border: 1px solid #2354a0; border-radius: .35rem; background: #2354a0; color: white; font: inherit; cursor: pointer; }
      button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #bd6a00; outline-offset: 3px; }
      select { padding: .5rem; font: inherit; }
      .filter { margin-top: 1.5rem; }
      .task { margin-top: .75rem; padding: 1rem; background: white; border: 1px solid #cbd3dd; border-radius: .5rem; }
      .task label { display: flex; align-items: center; gap: .75rem; margin: 0; overflow-wrap: anywhere; }
      .task input { width: auto; flex-shrink: 0; }
      .create button { margin-top: .8rem; }
      .projects { list-style: none; padding: 0; }
      .project { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: .75rem; padding: 1rem; background: white; border: 1px solid #cbd3dd; border-radius: .5rem; }
      .project span { overflow-wrap: anywhere; min-width: 0; }
      .project form { flex-shrink: 0; }
      [role="alert"] { color: #9a1b1b; font-weight: 600; }
      @media (max-width: 480px) { .project { align-items: flex-start; flex-direction: column; } }
    </style>
  </head>
  <body><main>${content}</main></body>
</html>`;
}

export function projectListPage(projects, error = '', name = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escapeHtml(name)}">
      <button type="submit">Create project</button>
    </form>
    <ul class="projects" aria-label="Projects">
      ${projects.map((project) => `<li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </li>`).join('')}
    </ul>
  `);
}

export function projectPage(project, tasks = [], filter = 'All', error = '', title = '') {
  const visibleTasks = tasks.filter((task) => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <p id="completion-error" role="alert" hidden></p>
    <script type="module" src="/project.js"></script>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text" value="${escapeHtml(title)}">
      <button type="submit">Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((value) => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <ul class="projects" aria-label="Tasks">
      ${visibleTasks.map((task) => `<li class="task" data-testid="task-row">
        <form data-task-completion method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          <input type="hidden" name="filter" value="${escapeHtml(filter)}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}><span>${escapeHtml(task.title)}</span></label>
        </form>
      </li>`).join('')}
    </ul>`);
}

export function notFoundPage() {
  return page('Page not found', '<h1>Page not found</h1><a href="/">Projects</a>');
}
