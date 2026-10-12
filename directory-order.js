export const directoryOrders = ['Original', 'Priority', 'Due date', 'Title'];

export function directoryOrder(value) {
  return directoryOrders.includes(value) ? value : 'Original';
}

function compareCodePoints(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

const foldTitle = (title) => title.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const priorityRank = { High: 0, Normal: 1, Low: 2 };

// Input is in Original order. Stable sorting preserves that order for ties,
// and a copy keeps ordering a view-only operation.
export function orderDirectoryTasks(tasks, order) {
  return [...tasks].sort((left, right) => {
    if (order === 'Priority') return priorityRank[left.priority] - priorityRank[right.priority];
    if (order === 'Due date') {
      if (!left.due_date || !right.due_date) return Number(!left.due_date) - Number(!right.due_date);
      return compareCodePoints(left.due_date, right.due_date);
    }
    if (order === 'Title') return compareCodePoints(foldTitle(left.title), foldTitle(right.title));
    return 0;
  });
}
