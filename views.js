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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #1c293c; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2ec; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid #8a97aa; border-radius: 6px; }
    button { font: inherit; font-weight: 600; color: white; background: #2456b5; border: 0; border-radius: 6px; padding: 10px 16px; cursor: pointer; }
    button:hover { background: #1a428e; }
    button:disabled { background: #738098; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #dd9c17; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { list-style: none; padding: 0; margin: 28px 0 0; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce2ec; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #9c2020; padding: 12px; background: #fff0f0; border-radius: 6px; }
    .empty { color: #596779; margin-top: 28px; }
    .project-rename, .task-create, .task-filter, .project-filter { margin-top: 24px; }
    select { font: inherit; padding: 8px; }
    .tasks { list-style: none; padding: 0; }
    .task { padding: 16px 0; border-top: 1px solid #dce2ec; }
    .task label { display: flex; align-items: center; gap: 12px; overflow-wrap: anywhere; }
    input[type="checkbox"] { width: 20px; height: 20px; flex-shrink: 0; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function renderProjects(projects, filter = 'Active', error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="project-filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    ${projects.length ? `<ul class="projects">${projects.map((project) => `
      <li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
        <form method="get" action="/projects/${escapeHtml(project.id)}">
          <button type="submit">Open project</button>
        </form>
        <form method="post" action="/projects/${escapeHtml(project.id)}/${project.archived ? 'restore' : 'archive'}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

export function renderProject(project, tasks = [], filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const projectPath = `/projects/${escapeHtml(project.id)}`;
  const rangeFields = `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const filterFields = `<input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="priorityFilter" value="${escapeHtml(priority)}">
      ${rangeFields}`;
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/">
      <button type="submit">Projects</button>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create project-rename" method="post" action="${projectPath}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="task-default-priority" method="post" action="${projectPath}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map((option) => `<option${project.default_task_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save default priority</button></noscript>
    </form>
    <form class="create task-create" method="post" action="${projectPath}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="task-filter" method="get" action="${projectPath}">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <form class="create due-range" method="post" action="${projectPath}/due-range">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    ${tasks.length ? `<ul class="tasks">${tasks.map((task) => `
      <li class="task" data-testid="task-row">
        <form method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}">
          ${filterFields}
          <label>
            <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
          <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save completion</button></noscript>
        </form>
        <form class="task-priority" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/priority">
          ${filterFields}
          <label for="task-priority-${escapeHtml(task.id)}">Task priority</label>
          <select id="task-priority-${escapeHtml(task.id)}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map((option) => `<option${task.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
          <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save priority</button></noscript>
        </form>
        <form class="create task-due-date" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/due-date">
          ${filterFields}
          <label for="task-due-date-${escapeHtml(task.id)}">Task due date</label>
          <input id="task-due-date-${escapeHtml(task.id)}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
        <form class="create task-rename" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/rename">
          ${filterFields}
          <label for="new-task-title-${escapeHtml(task.id)}">New task title</label>
          <input id="new-task-title-${escapeHtml(task.id)}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No tasks to show.</p>'}
  `);
}

export function renderNotFound() {
  return page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>');
}
