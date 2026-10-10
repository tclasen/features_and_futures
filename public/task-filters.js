import { normalizeDueDate } from '../due-date.js';

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

// Filtering is view-only: preserve the original tasks and their creation order.
export function filterTasks(tasks, completionFilter, priorityFilter, dueRange = { from: '', through: '' }) {
  return tasks.filter((task) => (
    completionFilter === 'All' || task.completed === (completionFilter === 'Completed')
  ) && (
    priorityFilter === 'All' || task.priority === priorityFilter
  ) && (
    (!dueRange.from && !dueRange.through) || (
      Boolean(task.due_date) &&
      (!dueRange.from || task.due_date >= dueRange.from) &&
      (!dueRange.through || task.due_date <= dueRange.through)
    )
  ));
}
