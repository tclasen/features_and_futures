# Task 005: Rename tasks while preserving completion and ownership

Preserve all Tasks 001 through 004 behavior.

- Each task row in an active project has a textbox labelled `New task title` and a `Rename task` button.
- Renaming trims surrounding whitespace and changes the visible task title and the completion checkbox's accessible label to `Complete <new-title>`.
- The task stays in its original project and creation-order position. Its completion state, filter membership and the project completion summary stay the same.
- An empty or whitespace-only new title leaves the old title unchanged and displays an alert containing `Task title is required`.
- The renamed title and completion state persist across page reloads and server-process restarts.
- Archived projects disable all task rename textboxes and buttons. Restoration enables them again without losing task data.
- Commit your implementation and report its exact commit ID.
