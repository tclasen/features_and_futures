import { normalizeDueDate } from './due-date.js';

const priorities = ['Low', 'Normal', 'High'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonblank = (value) => typeof value === 'string' && Boolean(value.trim());

// Validate every field before persistence, and copy only portable fields.
export function parseProjectImport(source) {
  let document;
  try {
    if (typeof source !== 'string') return null;
    document = JSON.parse(source);
  } catch {
    return null;
  }
  if (!isObject(document) || document.format !== 'workboard-project' || document.version !== 1) return null;
  const project = document.project;
  if (!isObject(project) || !isNonblank(project.name) || typeof project.archived !== 'boolean'
    || !priorities.includes(project.defaultPriority) || !Array.isArray(project.tasks)) return null;
  const tasks = [];
  for (const task of project.tasks) {
    if (!isObject(task) || !isNonblank(task.title) || typeof task.completed !== 'boolean'
      || !priorities.includes(task.priority) || typeof task.dueDate !== 'string'
      || normalizeDueDate(task.dueDate) !== task.dueDate || typeof task.notes !== 'string'
      || typeof task.deleted !== 'boolean') return null;
    tasks.push({
      title: task.title, completed: task.completed, priority: task.priority,
      dueDate: task.dueDate, notes: task.notes.replace(/\r\n?/g, '\n'), deleted: task.deleted,
    });
  }
  return { name: project.name, archived: project.archived, defaultPriority: project.defaultPriority, tasks };
}
