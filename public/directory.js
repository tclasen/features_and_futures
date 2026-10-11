import { matchesTask, dueRangeError } from './filters.js';

async function initializeDirectory() {
  if (window.location.pathname !== '/directory') return;
  document.querySelector('#projects-view').hidden = true;
  document.querySelector('#project-view').hidden = true;
  document.querySelector('#directory-view').hidden = false;
  document.title = 'Task directory · Workboard';

  const scope = document.querySelector('#directory-scope');
  const completion = document.querySelector('#directory-completion');
  const priority = document.querySelector('#directory-priority');
  const fromInput = document.querySelector('#directory-from');
  const throughInput = document.querySelector('#directory-through');
  const search = document.querySelector('#directory-search');
  const list = document.querySelector('#directory-list');
  const rangeAlert = document.querySelector('#directory-range-alert');
  let from = '';
  let through = '';
  let query = '';
  let tasks = [];
  scope.value = 'active';
  completion.value = priority.value = 'all';
  fromInput.value = throughInput.value = search.value = '';

  function render() {
    list.replaceChildren();
    for (const task of tasks) {
      if (task.archived !== (scope.value === 'archived')) continue;
      if (!matchesTask(task, completion.value, priority.value, from, through, query)) continue;
      const row = document.createElement('article');
      row.dataset.testid = 'directory-task-row';
      row.className = 'directory-row';
      for (const [testid, value] of [
        ['directory-task-title', task.title],
        ['directory-project-name', task.project_name],
        ['directory-task-completion', task.completed ? 'Completed' : 'Open'],
        ['directory-task-priority', task.priority],
        ['directory-task-due-date', task.due_date],
        ['directory-task-notes', task.notes],
      ]) {
        const field = document.createElement('div');
        field.dataset.testid = testid;
        field.textContent = value;
        row.append(field);
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => {
        window.location.href = `/projects/${encodeURIComponent(task.project_id)}`;
      });
      row.append(open);
      list.append(row);
    }
  }

  for (const control of [scope, completion, priority]) control.addEventListener('change', render);
  document.querySelector('#directory-search-form').addEventListener('submit', event => {
    event.preventDefault();
    query = search.value.trim();
    search.value = query;
    render();
  });
  document.querySelector('#directory-range-form').addEventListener('submit', event => {
    event.preventDefault();
    const nextFrom = fromInput.value.trim();
    const nextThrough = throughInput.value.trim();
    const error = dueRangeError(nextFrom, nextThrough);
    rangeAlert.textContent = error;
    rangeAlert.hidden = !error;
    if (error) return;
    from = fromInput.value = nextFrom;
    through = throughInput.value = nextThrough;
    render();
  });
  document.querySelector('#directory-back').addEventListener('click', () => {
    window.location.href = '/';
  });
  try {
    const response = await fetch('/api/directory');
    if (!response.ok) throw new Error('Unable to load task directory');
    tasks = await response.json();
    render();
  } catch (error) {
    const alert = document.querySelector('#directory-error');
    alert.textContent = error.message;
    alert.hidden = false;
  }
}

initializeDirectory();
