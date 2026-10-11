# Task 011: Move tasks between active projects

Preserve all Tasks 001 through 010 behavior.

- Every task row has a combobox labelled `Destination project` and a button labelled `Move task`. The combobox lists active projects other than the task's current project, using their current project names in project creation order. It has no other options. If there are no eligible destinations, the combobox and move button are disabled.
- Moving a task removes it from its source project and appends it after the destination's existing tasks. Preserve the task's title, completion, priority and due date, including blank dates. The destination's default priority does not replace the moved task's priority.
- The source project remains open after moving. Preserve all its selected completion/priority filters and applied due-range boundaries. Remaining rows retain their prior creation order and matching membership.
- Both projects' completion summaries count their current tasks after the move. The moved task appears only in its destination, survives reload and server-process restart, and can be moved again using the same rules.
- Archived projects cannot be move sources or destinations. Archived task rows have disabled destination comboboxes and move buttons. Restoration enables moving to eligible active destinations without changing the saved task data.
- Commit your implementation and report its exact commit ID.
