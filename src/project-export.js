// Portable field names are independent of SQLite columns and internal IDs.
export function projectDocument(project, tasks) {
  return {
    format: 'workboard-project',
    version: 1,
    project: {
      name: project.name,
      archived: Boolean(project.archived),
      defaultPriority: project.default_task_priority,
      tasks: tasks.map((task) => ({
        title: task.title,
        completed: Boolean(task.completed),
        priority: task.priority,
        dueDate: task.due_date,
        notes: task.notes.replace(/\r\n?/g, '\n'),
        deleted: Boolean(task.deleted),
      })),
    },
  };
}
