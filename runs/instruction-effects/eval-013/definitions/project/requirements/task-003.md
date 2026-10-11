# Task 003: Archive/restore and completion summaries

Preserve all Tasks 001 and 002 behavior.

- The project list has a combobox labelled `Project filter` with options `Active` and `Archived`, initially `Active`.
- Each active project row has an `Archive project` button. Archiving removes it from the Active list and adds it to the Archived list.
- Archived rows still have `Open project` and additionally `Restore project`. Restoration returns the project to Active without losing its tasks or completion state.
- An archived project page shows visible text `Archived project`, disables `Create task`, and disables all task completion checkboxes. Tasks remain visible and filtering works.
- Each project row includes `data-testid="project-summary"` with text `<completed-count>/<total-count> completed`. New projects show `0/0 completed`; the counts include all tasks regardless of the current task filter.
- Archive state, restored tasks, and completion counts persist across page reloads and process restarts.
- Commit your implementation and report its exact commit ID.
