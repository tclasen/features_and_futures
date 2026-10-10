# Task 008: Project defaults for new task priorities

Preserve all Tasks 001 through 007 behavior, with the following change to new-task defaults.

- Each project page has a combobox labelled `Default task priority`, with exactly `Low`, `Normal`, and `High` options in that order. Existing projects and newly created projects initially use `Normal`.
- Changing this selection saves that project's default. Subsequent tasks created in that project inherit the saved default instead of always using `Normal`. Changing the default never changes any existing task, including tasks that previously inherited a default.
- Defaults belong to projects independently. They survive reload, server-process restart, project renaming, archival and restoration. Existing tasks retain title, priority, completion state, ownership and creation order; the project summary retains its existing all-task meaning.
- Changing the default leaves both selected task filters unchanged, and does not change which existing task rows match those filters.
- Archived projects display their saved default in a disabled combobox. Restoration enables it and preserves its value.
- Commit your implementation and report its exact commit ID.
