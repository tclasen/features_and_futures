import { normalizeDueDate } from './due-dates.js';
import { matchesSearch } from './search.js';

export function normalizeDueRange(from, through) {
  const range = { from: normalizeDueDate(from), through: normalizeDueDate(through) };
  if (range.from === null || range.through === null) {
    throw new Error('Due range must use valid YYYY-MM-DD dates');
  }
  if (range.from && range.through && range.from > range.through) {
    throw new Error('Due from must not be after Due through');
  }
  return range;
}

export function matchesTaskFilters(task, completionFilter, priorityFilter, dueRange = { from: '', through: '' }, searchQuery = '') {
  const matchesCompletion = completionFilter === 'All'
    || (completionFilter === 'Completed' ? task.completed : !task.completed);
  const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter;
  const matchesDueRange = (!dueRange.from && !dueRange.through)
    || (Boolean(task.due_date)
      && (!dueRange.from || task.due_date >= dueRange.from)
      && (!dueRange.through || task.due_date <= dueRange.through));
  return matchesCompletion && matchesPriority && matchesDueRange && matchesSearch(task.title, searchQuery);
}
