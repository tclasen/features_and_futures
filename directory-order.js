const priorityRank = { High: 0, Normal: 1, Low: 2 };

function compareTitles(left, right) {
  const fold = (title) => Array.from(title.replace(/[A-Z]/g, (letter) => letter.toLowerCase()));
  const a = fold(left);
  const b = fold(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (difference) return difference;
  }
  return a.length - b.length;
}

// Input is in Original order. Stable sorting keeps ties in that order and
// copies the array so directory presentation cannot alter stored/view order.
export function orderDirectoryTasks(tasks, order) {
  return tasks.toSorted((left, right) => {
    if (order === 'Priority') return priorityRank[left.priority] - priorityRank[right.priority];
    if (order === 'Due date') {
      const a = left.dueDate || '';
      const b = right.dueDate || '';
      if (!a || !b) return Number(!a) - Number(!b);
      return a < b ? -1 : a > b ? 1 : 0;
    }
    if (order === 'Title') return compareTitles(left.title, right.title);
    return 0;
  });
}
