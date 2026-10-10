export function matchesTaskFilters(task, completionFilter, priorityFilter) {
  const matchesCompletion = completionFilter === 'All'
    || (completionFilter === 'Completed' && task.completed)
    || (completionFilter === 'Open' && !task.completed);
  return matchesCompletion && (priorityFilter === 'All' || task.priority === priorityFilter);
}
