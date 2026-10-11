export const directoryOrders = ['Original', 'Priority', 'Due date', 'Title'];

export function directoryOrder(value) {
  return directoryOrders.includes(value) ? value : 'Original';
}

function compareCodePoints(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (difference) return difference;
  }
  return a.length - b.length;
}

const foldTitle = (title) => title.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const priorityRank = { High: 0, Normal: 1, Low: 2 };

// Input is in Original order. Stable sorting retains that order for ties and
// operates on a copy so the view never changes stored or caller-owned order.
export function orderDirectoryTasks(tasks, order) {
  const result = [...tasks];
  if (order === 'Priority') {
    result.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  } else if (order === 'Due date') {
    result.sort((a, b) => {
      if (!a.due_date || !b.due_date) return Number(!a.due_date) - Number(!b.due_date);
      return compareCodePoints(a.due_date, b.due_date);
    });
  } else if (order === 'Title') {
    result.sort((a, b) => compareCodePoints(foldTitle(a.title), foldTitle(b.title)));
  }
  return result;
}
