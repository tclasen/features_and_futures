export function matchesTaskFilters(task, completionFilter, priorityFilter) {
  const matchesCompletion = completionFilter === 'all'
    || (completionFilter === 'completed' ? task.completed : !task.completed);
  const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
  return matchesCompletion && matchesPriority;
}
