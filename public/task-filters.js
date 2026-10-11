export function filterTasks(tasks, completion, priority) {
  return tasks.filter(task =>
    (completion === 'all' || (completion === 'completed' ? task.completed : !task.completed)) &&
    (priority === 'all' || task.priority === priority));
}
