function compareTitles(left, right) {
  const fold = (title) => Array.from(title.replace(/[A-Z]/g, (letter) => letter.toLowerCase()));
  const a = fold(left);
  const b = fold(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (difference) return difference;
  }
  return a.length - b.length;
}

// The input is in original order. Stable sorting preserves that order for ties,
// and sorting a copy leaves project views and remembered positions untouched.
export function orderDirectoryTasks(tasks, order) {
  const priorities = { High: 0, Normal: 1, Low: 2 };
  const result = tasks.slice();
  if (order === 'priority') {
    result.sort((a, b) => priorities[a.priority] - priorities[b.priority]);
  } else if (order === 'due-date') {
    result.sort((a, b) => {
      if (!a.due_date || !b.due_date) return Number(!a.due_date) - Number(!b.due_date);
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    });
  } else if (order === 'title') {
    result.sort((a, b) => compareTitles(a.title, b.title));
  }
  return result;
}
