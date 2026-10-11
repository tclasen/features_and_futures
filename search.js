// Fold ASCII letters only: non-ASCII names retain their exact spelling.
export function matchesSearch(value, query) {
  const fold = (text) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return fold(value).includes(fold(query.trim()));
}
