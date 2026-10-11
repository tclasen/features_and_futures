# Task 013: Project and task search

Preserve all Tasks 001 through 012 behavior.

- The project list has a textbox labelled `Project search` and a button labelled `Search projects`. Search matches project names by substring, ignoring ASCII letter case and trimming only surrounding query whitespace. Internal whitespace remains significant. A blank trimmed query matches all projects.
- Project search intersects the existing active/archived project filter. Changing that filter retains the applied query. Matching projects remain in project creation order and keep their all-task summaries. Opening the project list initially, or returning through `Projects`, begins with an empty search query.
- Each project page has a textbox labelled `Task search` and a button labelled `Search tasks`. It matches task titles with the same substring/case/whitespace rules. Opening a project from the list initializes an empty query.
- Task search intersects the existing completion, priority and due-range filters. Applying search retains all other selected filter values/boundaries; changing those filters retains the applied search query. Matching tasks retain their existing order.
- Task title renaming, date/priority/completion edits, movement, creation and project-default changes retain the applied task query and other filters, immediately re-evaluating visible membership. Search never changes stored task data or project summary counts.
- Task search remains usable in archived projects while task editing controls stay disabled. Clearing the query restores rows matching the other selected filters. All movement/return-position and persistence behavior remains intact.
- Commit your implementation and report its exact commit ID.
