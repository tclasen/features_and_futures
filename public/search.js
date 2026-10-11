// Fold ASCII letters only: non-ASCII characters remain significant.
function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function normalizeSearchQuery(query) {
  return foldAscii(query.trim());
}

// Apply normalization on submission; matching consumes that applied query.
export function matchesSearch(value, query) {
  return foldAscii(value).includes(query);
}

export function filterProjects(projects, archiveFilter, query = '') {
  return projects.filter((project) => project.archived === (archiveFilter === 'archived')
    && matchesSearch(project.name, query));
}
