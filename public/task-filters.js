import { normalizeDueDate } from './task-due-date.js';

export function normalizeDueRange(from, through) {
  let range;
  try {
    range = { from: normalizeDueDate(from), through: normalizeDueDate(through) };
  } catch {
    throw new Error('Due range must use valid YYYY-MM-DD dates');
  }
  if (range.from && range.through && range.from > range.through) {
    throw new Error('Due from must not be after Due through');
  }
  return range;
}

export function matchesTaskFilters(task, completionFilter, priorityFilter, dueRange = { from: '', through: '' }) {
  const matchesCompletion = completionFilter === 'all'
    || (completionFilter === 'completed' ? task.completed : !task.completed);
  const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
  const matchesDueRange = (!dueRange.from && !dueRange.through)
    || Boolean(task.dueDate
      && (!dueRange.from || task.dueDate >= dueRange.from)
      && (!dueRange.through || task.dueDate <= dueRange.through));
  return matchesCompletion && matchesPriority && matchesDueRange;
}
