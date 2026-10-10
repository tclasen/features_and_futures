// Filtering is view-only: preserve the original tasks and their creation order.
export function filterTasks(tasks, completionFilter, priorityFilter) {
  return tasks.filter((task) => (
    completionFilter === 'All' || task.completed === (completionFilter === 'Completed')
  ) && (
    priorityFilter === 'All' || task.priority === priorityFilter
  ));
}
