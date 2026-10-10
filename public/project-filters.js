import { matchesSearch } from './search.js';

export function filterProjects(projects, archiveFilter, searchQuery = '') {
  return projects.filter((project) =>
    project.archived === (archiveFilter === 'Archived') && matchesSearch(project.name, searchQuery));
}
