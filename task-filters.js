import { matchesDueRange } from './due-date.js';
import { matchesSearch } from './search.js';

// Shared by project views, the directory, and directory bulk writes.
export function matchesTaskFilters(task, completion, priority, dueRange, query) {
  return (completion === 'Deleted' ? task.deleted : !task.deleted
    && (completion === 'All' || (completion === 'Completed' ? task.completed : !task.completed)))
    && (priority === 'All' || task.priority === priority)
    && matchesDueRange(task.dueDate, dueRange)
    && matchesSearch(task.title, query);
}
