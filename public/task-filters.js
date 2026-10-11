import { normalizeDueDate } from '../due-date.js';

function foldASCII(value) {
  return value.replace(/[A-Z]/g, letter => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return foldASCII(value).includes(foldASCII(query.trim()));
}

export function filterProjects(projects, archiveFilter, query = '') {
  return projects.filter(project =>
    Boolean(project.archived) === (archiveFilter === 'archived') &&
    matchesSearch(project.name, query));
}

export function normalizeDueRange(from, through) {
  const normalizedFrom = normalizeDueDate(from);
  const normalizedThrough = normalizeDueDate(through);
  if (normalizedFrom === null || normalizedThrough === null) {
    throw new Error('Due range must use valid YYYY-MM-DD dates');
  }
  if (normalizedFrom && normalizedThrough && normalizedFrom > normalizedThrough) {
    throw new Error('Due from must not be after Due through');
  }
  return { from: normalizedFrom, through: normalizedThrough };
}

export function filterTasks(tasks, completion, priority, range = { from: '', through: '' }, query = '') {
  return tasks.filter(task =>
    (completion === 'all' || (completion === 'completed' ? task.completed : !task.completed)) &&
    (priority === 'all' || task.priority === priority) &&
    ((!range.from && !range.through) || (Boolean(task.due_date) &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))) &&
    matchesSearch(task.title || '', query));
}
