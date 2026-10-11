// This portable representation intentionally excludes database identities and
// remembered positions. Normalize textarea line endings only in the export.
export function projectExport(project, tasks) {
  return {
    format: 'workboard-project',
    version: 1,
    project: {
      name: project.name,
      archived: Boolean(project.archived),
      defaultPriority: project.default_task_priority ?? 'Normal',
      tasks: tasks.map((task) => ({
        title: task.title,
        completed: Boolean(task.completed),
        priority: task.priority ?? 'Normal',
        dueDate: task.due_date ?? '',
        notes: (task.notes ?? '').replace(/\r\n?/g, '\n'),
        deleted: Boolean(task.deleted),
      })),
    },
  };
}
