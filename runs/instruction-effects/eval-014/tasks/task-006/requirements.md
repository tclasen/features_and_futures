# Task 006: Persistent task priorities

Preserve all Tasks 001 through 005 behavior.

- Each task row has a combobox labelled `Task priority`, with exactly `Low`, `Normal`, and `High` options in that order. Existing tasks and newly created tasks default to `Normal`.
- Selecting an option changes that task's priority. The selected option represents the saved priority after reload and server-process restart.
- Priority edits leave the title, completion state, project ownership, creation-order position, completion-filter membership, and project completion summary unchanged. Task renaming preserves priority.
- Priority belongs to each task independently; changing one task must not change another task or project.
- Archived projects disable every task priority combobox. Restoration enables them and preserves their saved values.
- Commit your implementation and report its exact commit ID.
