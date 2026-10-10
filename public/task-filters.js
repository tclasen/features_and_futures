// Filtering changes only the view; saved task order and data remain intact.
export function filterTasks(tasks, completionFilter, priorityFilter) {
  return tasks.filter((task) => {
    const matchesCompletion = completionFilter === 'All'
      || (completionFilter === 'Completed' ? task.completed : !task.completed);
    const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter;
    return matchesCompletion && matchesPriority;
  });
}
