function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #172438; background: #f3f5f9; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; }
    h1 { font-size: 2.2rem; overflow-wrap: anywhere; }
    .panel { background: white; padding: 24px; border: 1px solid #d8deea; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; flex-wrap: wrap; }
    input { flex: 1; min-width: 160px; padding: 11px; border: 1px solid #8693a8; border-radius: 6px; font: inherit; }
    input[type="checkbox"] { flex: none; min-width: auto; width: 20px; height: 20px; }
    .task label { margin: 0; display: flex; align-items: center; gap: 12px; overflow-wrap: anywhere; }
    select { padding: 10px; font: inherit; margin-bottom: 12px; }
    button { padding: 11px 16px; border: 0; border-radius: 6px; background: #2357bd; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #174398; }
    button:disabled { background: #788394; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #a36b00; outline-offset: 3px; }
    ul { list-style: none; padding: 0; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 12px; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a31c24; font-weight: 600; }
    .empty { color: #526078; }
    @media (max-width: 480px) { main { margin: 20px auto; padding: 16px; } .project { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function renderProjects(projects, error = '', filter = 'Active') {
  return page('Projects', `
    <h1>Workboard</h1>
    <section class="panel" aria-label="Create a project">
      <form method="post" action="/projects?filter=${filter}">
        <label for="project-name">Project name</label>
        <div class="create">
          <input id="project-name" name="name" type="text" autocomplete="off"${error ? ' aria-invalid="true" aria-describedby="name-error"' : ''}>
          <button type="submit">Create project</button>
        </div>
        ${error ? `<p id="name-error" role="alert">${escapeHtml(error)}</p>` : ''}
      </form>
    </section>
    <h2>Projects</h2>
    <form method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? `<ul>${projects.map(project => `
      <li class="panel project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}">
          <button type="submit">Open project</button>
        </form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

export function renderProject(project, tasks = [], filter = 'All', error = '', renameError = '', taskRenameError = null, priorityFilter = 'All') {
  const query = `filter=${filter}&amp;priorityFilter=${priorityFilter}`;
  return page(project.name, `
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <section class="panel" aria-label="Rename a project">
      <form method="post" action="/projects/${project.id}/rename?${query}">
        <label for="new-project-name">New project name</label>
        <div class="create">
          <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}${renameError ? ' aria-invalid="true" aria-describedby="rename-error"' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
        </div>
        ${renameError ? `<p id="rename-error" role="alert">${escapeHtml(renameError)}</p>` : ''}
      </form>
    </section>
    <section class="panel" aria-label="Create a task">
      <form method="post" action="/projects/${project.id}/default-priority?${query}">
        <label for="default-task-priority">Default task priority</label>
        <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${['Low', 'Normal', 'High'].map(value => `<option${project.default_priority === value ? ' selected' : ''}>${value}</option>`).join('')}
        </select>
      </form>
      <form method="post" action="/projects/${project.id}/tasks?${query}">
        <label for="task-title">Task title</label>
        <div class="create">
          <input id="task-title" name="title" type="text" autocomplete="off"${error ? ' aria-invalid="true" aria-describedby="task-error"' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
        </div>
        ${error ? `<p id="task-error" role="alert">${escapeHtml(error)}</p>` : ''}
      </form>
    </section>
    <h2>Tasks</h2>
    <form method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map(value => `<option${priorityFilter === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? `<ul>${tasks.map(task => `
      <li class="panel task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}?${query}">
          <label>
            <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority?${query}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map(value => `<option${task.priority === value ? ' selected' : ''}>${value}</option>`).join('')}
          </select>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date?${query}">
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="create">
            <input id="task-due-date-${task.id}" name="due_date" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </div>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename?${query}">
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="create">
            <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}${taskRenameError?.id === task.id ? ` aria-invalid="true" aria-describedby="task-rename-error-${task.id}"` : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
          ${taskRenameError?.id === task.id ? `<p id="task-rename-error-${task.id}" role="alert">${escapeHtml(taskRenameError.message)}</p>` : ''}
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No matching tasks.</p>'}
  `);
}
