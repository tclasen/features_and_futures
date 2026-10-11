import { normalizeDueDate } from './due-date.js';

const priorities = ['Low', 'Normal', 'High'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonblankText = (value) => typeof value === 'string' && value.trim() !== '';

// Validate the whole portable document before persistence. Whitelist public fields
// so extra properties can never supply identities or remembered positions.
export function parseProjectImport(text) {
  if (typeof text !== 'string') return null;
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(document) || document.format !== 'workboard-project' || document.version !== 1) return null;
  const project = document.project;
  if (!isObject(project) || !isNonblankText(project.name)
    || typeof project.archived !== 'boolean' || !priorities.includes(project.defaultPriority)
    || !Array.isArray(project.tasks)) return null;

  const tasks = [];
  for (const task of project.tasks) {
    if (!isObject(task) || !isNonblankText(task.title)
      || typeof task.completed !== 'boolean' || !priorities.includes(task.priority)
      || typeof task.dueDate !== 'string' || normalizeDueDate(task.dueDate) !== task.dueDate
      || typeof task.notes !== 'string' || typeof task.deleted !== 'boolean') return null;
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
