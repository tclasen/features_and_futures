import { normalizeDueDate } from './due-date.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblank = value => typeof value === 'string' && value.trim().length > 0;
const priority = value => ['Low', 'Normal', 'High'].includes(value);

// Validate every portable field before any database writes. Internal IDs and
// other extra properties are deliberately ignored by the importer.
export function validateProjectDocument(source) {
  let document;
  try { document = JSON.parse(source); }
  catch { return null; }
  if (!isObject(document) || document.format !== 'workboard-project' || document.version !== 1) return null;
  const project = document.project;
  if (!isObject(project) || !nonblank(project.name) || typeof project.archived !== 'boolean' ||
      !priority(project.defaultPriority) || !Array.isArray(project.tasks)) return null;
  for (const task of project.tasks) {
    if (!isObject(task) || !nonblank(task.title) || typeof task.completed !== 'boolean' ||
        !priority(task.priority) || typeof task.dueDate !== 'string' ||
        normalizeDueDate(task.dueDate) !== task.dueDate || typeof task.notes !== 'string' ||
        typeof task.deleted !== 'boolean') return null;
  }
  return project;
}
