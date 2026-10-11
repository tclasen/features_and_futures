import { matchesDueRange } from './task-dates.js';
import { matchesSearch } from './search.js';

// Shared by project pages, directory results, and directory bulk actions.
export function matchesTask(task, filter, priority, range, search) {
  return (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted
    && (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')))
    && (priority === 'All' || task.priority === priority)
    && matchesDueRange(task.due_date, range)
    && matchesSearch(task.title, search);
}
