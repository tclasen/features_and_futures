import { validDueDate } from './dates.js';

export function matchesSearch(text, query) {
  const normalize = value => value.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, letter => letter.toLowerCase());
  return normalize(text).includes(normalize(query));
}

export function dueRangeError(from, through) {
  if (!validDueDate(from) || !validDueDate(through)) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (from && through && from > through) return 'Due from must not be after Due through';
  return '';
}

export function matchesTask(task, completion, priority, from, through, query) {
  if (Boolean(task.deleted) !== (completion === 'deleted')) return false;
  if (completion === 'open' && task.completed) return false;
  if (completion === 'completed' && !task.completed) return false;
  if (priority !== 'all' && task.priority !== priority) return false;
  if (from || through) {
    if (!task.due_date) return false;
    if (from && task.due_date < from) return false;
    if (through && task.due_date > through) return false;
  }
  return matchesSearch(task.title, query);
}
