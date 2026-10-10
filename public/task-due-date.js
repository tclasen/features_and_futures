export function normalizeDueDate(value) {
  if (typeof value === 'string') {
    const date = value.trim();
    if (!date) return '';
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [year, month, day] = match.slice(1).map(Number);
      const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]) {
        return date;
      }
    }
  }
  const error = new Error('Due date must be a valid YYYY-MM-DD date');
  error.status = 400;
  throw error;
}
