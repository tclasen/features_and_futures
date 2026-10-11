# Task 010: Inclusive due-date range filtering

Preserve all Tasks 001 through 009 behavior.

- Each project page has textboxes labelled `Due from` and `Due through`, and a button labelled `Apply due range`. Opening a project from the project list initializes both fields to empty.
- Applying a range filters tasks by inclusive calendar-date boundaries. A blank boundary is unbounded on that side. When both boundaries are blank, dated and undated tasks all match. When either boundary is present, undated tasks do not match.
- The due range intersects both existing completion and priority filters. Matching rows retain creation order. Applying a range retains both selected combobox values; changing either combobox retains the applied range. The project summary continues to count all tasks.
- Trim surrounding whitespace. Nonblank boundaries must satisfy the Task009 calendar-date rules. On invalid syntax or impossible dates, show a visible alert containing `Due range must use valid YYYY-MM-DD dates`. If both dates are valid but from is after through, show a visible alert containing `Due from must not be after Due through`. Invalid applications preserve the previous applied range and visible membership.
- Saving a task due date, priority or completion immediately re-evaluates visible membership under all three filters. Task or project renaming, task creation and default-priority changes retain the applied range and both selected combobox values. None of the filters changes saved task data.
- Due-range controls remain usable in archived projects; existing task editing controls stay disabled. Restoration preserves all saved dates and task data. Reopening a project starts with empty due-range boundaries.
- Commit your implementation and report its exact commit ID.
