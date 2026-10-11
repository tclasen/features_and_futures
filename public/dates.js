// Calendar days are validated numerically, without timezone conversion.
export function normalizeDueDate(value) {
  const invalid = () => {
    const error = new Error('Due date must be a valid YYYY-MM-DD date');
    error.status = 400;
    throw error;
  };
  if (typeof value !== 'string') return invalid();
  const date = value.trim();
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid();
  const [year, month, day] = date.split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) {
    return invalid();
  }
  return date;
}
