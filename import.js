import { isValidDueDate } from './dates.js';

const priorities = ['Low', 'Normal', 'High'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isName = (value) => typeof value === 'string' && value.trim().length > 0;

// Validate the whole portable document before persistence. Copy only public
// fields, never user-supplied identities or remembered ordering positions.
export function parseProjectImport(json) {
  let document;
  try {
    document = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(document) || document.format !== 'workboard-project' || document.version !== 1) return null;
  const project = document.project;
  if (!isObject(project) || !isName(project.name) || typeof project.archived !== 'boolean' ||
      !priorities.includes(project.defaultPriority) || !Array.isArray(project.tasks)) return null;
  const tasks = [];
  for (const task of project.tasks) {
    if (!isObject(task) || !isName(task.title) || typeof task.completed !== 'boolean' ||
        !priorities.includes(task.priority) || typeof task.dueDate !== 'string' ||
        (task.dueDate !== '' && !isValidDueDate(task.dueDate)) ||
        typeof task.notes !== 'string' || typeof task.deleted !== 'boolean') return null;
    tasks.push({
      title: task.title,
      completed: task.completed,
      priority: task.priority,
      dueDate: task.dueDate,
      notes: task.notes.replace(/\r\n?/g, '\n'),
      deleted: task.deleted,
    });
  }
  return { name: project.name, archived: project.archived, defaultPriority: project.defaultPriority, tasks };
}
