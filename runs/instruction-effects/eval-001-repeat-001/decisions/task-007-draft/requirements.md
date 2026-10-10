# Task 007: Combined task priority and completion filters

Preserve all Tasks 001 through 006 behavior.

- Each project page has a combobox labelled `Priority filter`, with exactly `All`, `Low`, `Normal`, and `High` options in that order. Opening a project from the project list initially selects `All`.
- Display only tasks matching both the existing `Task filter` and the `Priority filter`. `All` matches every value on its own filter. Retain creation order among matching tasks.
- Changing either filter leaves the other selected value unchanged. Filter changes do not alter saved task data or the project completion summary, which still counts all tasks.
- Changing a task's priority or completion immediately re-evaluates the visible rows under both selected filters, without resetting either selected filter. The changed state persists using the existing rules.
- Renaming a task does not change its priority or completion-filter membership.
- Both filters remain usable in archived projects. The existing archived task editing controls remain disabled, and restoration preserves task data.
- Commit your implementation and report its exact commit ID.
