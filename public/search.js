// Normalize only for matching; preserve the original saved and displayed text.
function normalizeSearchText(value) {
  return value.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return normalizeSearchText(value).includes(normalizeSearchText(query.trim()));
}

export function matchesProjectFilters(project, archiveFilter, query = '') {
  return project.archived === (archiveFilter === 'Archived')
    && matchesSearch(project.name, query);
}
