// Fold only ASCII letters; non-ASCII characters and internal whitespace stay exact.
function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function normalizeSearchQuery(value) {
  return value.trim();
}

export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(query));
}

export function matchesProjectFilters(project, archiveFilter, query = '') {
  return Boolean(project.archived) === (archiveFilter === 'Archived')
    && matchesSearch(project.name, query);
}
