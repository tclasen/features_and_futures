export const DIRECTORY_ORDERS = ['Original', 'Priority', 'Due date', 'Title'];

export function directoryOrder(value) {
  return DIRECTORY_ORDERS.includes(value) ? value : 'Original';
}

function compareTitles(left, right) {
  const fold = (title) => title.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const leftPoints = Array.from(fold(left), (character) => character.codePointAt(0));
  const rightPoints = Array.from(fold(right), (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

export function orderDirectoryTasks(tasks, order) {
  const priorityRank = { High: 0, Normal: 1, Low: 2 };
  const comparators = {
    Priority: (left, right) => priorityRank[left.priority] - priorityRank[right.priority],
    'Due date': (left, right) => {
      if (left.due_date === right.due_date) return 0;
      if (!left.due_date) return 1;
      if (!right.due_date) return -1;
      return left.due_date < right.due_date ? -1 : 1;
    },
    Title: (left, right) => compareTitles(left.title, right.title),
  };
  // Stable sorting keeps the input's original owner/position order for ties.
  // Copy the result so ordering cannot change its caller's original sequence.
  const result = [...tasks];
  const compare = comparators[order];
  return compare ? result.sort(compare) : result;
}
