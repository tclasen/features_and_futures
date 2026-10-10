import { matchesSearch } from './search.js';

export function matchesTaskFilters(task, completionFilter, priorityFilter, dueRange = { from: '', through: '' }, query = '') {
  const matchesCompletion = completionFilter === 'All'
    || (completionFilter === 'Completed' && task.completed)
    || (completionFilter === 'Open' && !task.completed);
  // Canonical YYYY-MM-DD strings sort in calendar order without timezone conversion.
  const matchesDueRange = (!dueRange.from && !dueRange.through)
    || (Boolean(task.dueDate)
      && (!dueRange.from || task.dueDate >= dueRange.from)
      && (!dueRange.through || task.dueDate <= dueRange.through));
  return matchesCompletion && (priorityFilter === 'All' || task.priority === priorityFilter)
    && matchesDueRange && matchesSearch(task.title, query);
}
