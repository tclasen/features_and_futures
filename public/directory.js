import { filterDirectory, normalizeDueRange } from './task-filters.js';

export async function renderDirectory(app, request, showError) {
  const tasks = await request('/api/task-directory');
  document.title = 'Task directory · Workboard';
  app.innerHTML = `
    <button type="button" id="back">Projects</button>
    <h1>Task directory</h1>
    <label for="project-scope">Project scope</label>
    <select id="project-scope">
      <option value="active">Active</option>
      <option value="archived">Archived</option>
    </select>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="completed">Completed</option>
      <option value="deleted">Deleted</option>
    </select>
    <label for="priority-filter">Priority filter</label>
    <select id="priority-filter">
      <option value="all">All</option>
      <option value="Low">Low</option>
      <option value="Normal">Normal</option>
      <option value="High">High</option>
    </select>
    <form id="directory-search-form">
      <label for="directory-search">Directory search</label>
      <div class="form-controls">
        <input id="directory-search" type="text" autocomplete="off">
        <button type="submit">Search directory</button>
      </div>
    </form>
    <form id="due-range-form">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <p id="error" role="alert" hidden></p>
    <p id="empty">No tasks to show.</p>
    <ul id="directory-tasks"></ul>`;
  document.getElementById('back').addEventListener('click', () => location.assign('/'));
  const scope = document.getElementById('project-scope');
  const completion = document.getElementById('task-filter');
  const priority = document.getElementById('priority-filter');
  const search = document.getElementById('directory-search');
  const from = document.getElementById('due-from');
  const through = document.getElementById('due-through');
  const list = document.getElementById('directory-tasks');
  let query = '';
  let range = { from: '', through: '' };

  function drawTasks() {
    const visible = filterDirectory(tasks, scope.value, completion.value, priority.value, range, query);
    list.replaceChildren(...visible.map(task => {
      const row = document.createElement('li');
      row.dataset.testid = 'directory-task-row';
      for (const [testid, value] of [
        ['directory-task-title', task.title],
        ['directory-project-name', task.project_name],
        ['directory-task-completion', task.completed ? 'Completed' : 'Open'],
        ['directory-task-priority', task.priority],
        ['directory-task-due-date', task.due_date],
        ['directory-task-notes', task.notes],
      ]) {
        const field = document.createElement('span');
        field.dataset.testid = testid;
        field.textContent = value;
        row.append(field);
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => location.assign(`/projects/${task.project_id}`));
      row.append(open);
      return row;
    }));
    document.getElementById('empty').hidden = visible.length > 0;
  }

  for (const control of [scope, completion, priority]) control.addEventListener('change', drawTasks);
  document.getElementById('directory-search-form').addEventListener('submit', event => {
    event.preventDefault();
    query = search.value.trim();
    search.value = query;
    drawTasks();
  });
  document.getElementById('due-range-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      range = normalizeDueRange(from.value, through.value);
      from.value = range.from;
      through.value = range.through;
      document.getElementById('error').hidden = true;
      drawTasks();
    } catch (error) { showError(error.message); }
  });
  drawTasks();
}
