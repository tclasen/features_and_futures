# Task 009: Optional persistent task due dates

Preserve all Tasks 001 through 008 behavior.

- Every task row has a textbox labelled `Task due date` and a button labelled `Save due date`. New and existing tasks initially have no due date, shown as an empty textbox.
- Saving an empty or whitespace-only value clears the due date. Otherwise trim surrounding whitespace and accept only a real Gregorian calendar date in `YYYY-MM-DD` format, with a four-digit year from 0001 through 9999. Store and display the canonical date; it survives reload and server-process restart. Dates represent calendar days without timezone conversion.
- On an invalid nonempty value, show a visible alert containing `Due date must be a valid YYYY-MM-DD date`. Preserve the previous saved date and all other task data.
- Dates belong to tasks independently. Saving or clearing a date preserves title, completion, priority, project ownership, creation order, both selected filters and project completion summary. Task renaming preserves its due date.
- Archived projects disable the due-date textbox and save button for every task. Restoration enables both and preserves saved dates.
- Commit your implementation and report its exact commit ID.
