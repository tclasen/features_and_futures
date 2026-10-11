# Task 004: Rename projects while preserving their identity

Preserve all Tasks 001 through 003 behavior.

- An active project page has a textbox labelled `New project name` and a `Rename project` button.
- Renaming trims surrounding whitespace and changes the visible project heading and project-list name. The project's URL/identity, creation-order position, tasks, task completion states and completion summary stay the same.
- An empty or whitespace-only name leaves the original name unchanged and displays an alert containing `Project name is required`.
- The new name persists across reloads and server-process restarts.
- An archived project's rename textbox and button are disabled. After restoration, renaming is enabled again without losing any existing project data.
- Commit your implementation and report its exact commit ID.
