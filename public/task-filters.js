export function matchesTaskFilters(task, completionFilter, priorityFilter) {
  const matchesCompletion = completionFilter === 'All'
    || (completionFilter === 'Completed' ? task.completed : !task.completed);
  const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter;
  return matchesCompletion && matchesPriority;
}
