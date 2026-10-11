// Normalize only for matching; saved names and titles remain untouched.
function normalizeSearchText(value) {
  return value.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function normalizeSearchQuery(query) {
  return normalizeSearchText(query.trim());
}

// Apply normalization on submission; matching consumes that applied query.
export function matchesSearch(value, query) {
  return normalizeSearchText(value).includes(query);
}

export function filterProjects(projects, archiveFilter, query = '') {
  return projects.filter((project) => project.archived === (archiveFilter === 'archived')
    && matchesSearch(project.name, query));
}
