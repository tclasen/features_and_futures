// Filtering only changes visibility; saved tasks retain their original order and data.
export function filterTasks(tasks, completionFilter, priorityFilter) {
  return tasks.filter((task) => {
    const matchesCompletion = completionFilter === 'all'
      || (completionFilter === 'completed' && task.completed)
      || (completionFilter === 'open' && !task.completed);
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    return matchesCompletion && matchesPriority;
  });
}
