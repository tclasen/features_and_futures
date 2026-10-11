import { TASK_PRIORITIES } from './task-priorities.js';

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
    button:disabled { background: #738096; border-color: #738096; cursor: default; }
    :focus-visible { outline: 3px solid #ad6c00; outline-offset: 3px; }
    [role="alert"] { color: #a21b25; margin: 0 0 16px; }
    .projects { margin-top: 24px; display: grid; gap: 12px; }
    .project-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; background: white; border: 1px solid #d7dfe8; border-radius: 10px; padding: 18px 24px; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    .task-create { margin-top: 24px; }
    .task-filter { margin-top: 24px; }
    select { padding: 10px 12px; font: inherit; border: 1px solid #8996a8; border-radius: 6px; background: white; }
    .task-row { background: white; border: 1px solid #d7dfe8; border-radius: 10px; padding: 18px 24px; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-rename { margin-top: 16px; }
    .task-rename label { display: block; margin-bottom: 8px; }
    .task-rename input { width: 100%; margin-bottom: 12px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .form-controls { flex-direction: column; } .project-row { padding: 16px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectListPage(projects, error = '', filter = 'Active') {
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create-form" method="post" action="/projects">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="projects">
      ${projects.map((project) => `<div class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form>
      </div>`).join('')}
    </div>`);
}

export function projectPage(project, tasks = [], filter = 'All', priorityFilter = 'All', errors = {}) {
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="create-form task-create" method="post" action="/projects/${project.id}/rename">
      ${errors.projectRename ? `<p role="alert">${escapeHtml(errors.projectRename)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form class="create-form task-create" method="post" action="/projects/${project.id}/tasks">
      ${errors.taskCreation ? `<p role="alert">${escapeHtml(errors.taskCreation)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...TASK_PRIORITIES].map((option) => `<option${priorityFilter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="projects">
      ${tasks.map((task) => `<div class="task-row" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="task-filter" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${TASK_PRIORITIES.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${errors.taskRename?.id === task.id ? `<p role="alert">${escapeHtml(errors.taskRename.message)}</p>` : ''}
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
      </div>`).join('')}
    </div>`);
}
