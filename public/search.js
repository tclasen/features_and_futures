// Fold only ASCII letters; other characters and internal whitespace stay significant.
function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(query.trim()));
}

export function matchesProjectFilters(project, archiveFilter, query = '') {
  return project.archived === (archiveFilter === 'Archived')
    && matchesSearch(project.name, query);
}
