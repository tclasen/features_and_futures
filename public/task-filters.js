import { normalizeDueDate } from './dates.js';
import { matchesSearch } from './search.js';

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

// Filtering only changes visibility; saved tasks retain their original order and data.
export function filterTasks(tasks, completionFilter, priorityFilter, dueRange = { from: '', through: '' }, query = '') {
  return tasks.filter((task) => {
    const matchesCompletion = completionFilter === 'deleted'
      ? Boolean(task.deleted)
      : !task.deleted && (
        completionFilter === 'all'
        || (completionFilter === 'completed' && task.completed)
        || (completionFilter === 'open' && !task.completed)
      );
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    // Canonical YYYY-MM-DD strings sort in calendar order across years 0001–9999.
    const matchesDueRange = (!dueRange.from && !dueRange.through)
      || Boolean(task.due_date
        && (!dueRange.from || task.due_date >= dueRange.from)
        && (!dueRange.through || task.due_date <= dueRange.through));
    return matchesCompletion && matchesPriority && matchesDueRange && matchesSearch(task.title, query);
  });
}
