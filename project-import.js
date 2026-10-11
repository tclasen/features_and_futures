import { TASK_PRIORITIES } from './task-priorities.js';
import { normalizeDueDate } from './task-dates.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonblankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Validate the entire portable document before persistence. Copy only public
// fields so additional properties cannot supply identities or ordering state.
export function parseProjectImport(json) {
  let document;
  try {
    document = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(document) || document.format !== 'workboard-project' || document.version !== 1) return null;
  const project = document.project;
  if (!isObject(project) || !isNonblankString(project.name)
    || typeof project.archived !== 'boolean'
    || !TASK_PRIORITIES.includes(project.defaultPriority)
    || !Array.isArray(project.tasks)) return null;

  const tasks = [];
  for (const task of project.tasks) {
    if (!isObject(task) || !isNonblankString(task.title)
      || typeof task.completed !== 'boolean'
      || !TASK_PRIORITIES.includes(task.priority)
      || typeof task.dueDate !== 'string'
      || normalizeDueDate(task.dueDate) !== task.dueDate
      || typeof task.notes !== 'string'
      || typeof task.deleted !== 'boolean') return null;
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
