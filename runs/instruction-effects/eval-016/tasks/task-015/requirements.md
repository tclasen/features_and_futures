## Requirement015: editable multiline task notes

Dependencies: all requirements through014 remain cumulative.

Every task has an optional multiline notes field. Existing tasks and newly created tasks begin with empty notes. Each task row provides an accessible textarea named `Task notes` and a button named `Save notes`. Saving notes preserves the entered text, including leading/trailing spaces, line breaks, Unicode and literal markup. Empty text clears the notes. Notes are plain text, persist across reloads and server restarts, and do not change the task title, completion, priority, due date, project ownership or remembered ordering.

Notes travel with a task through moves and return-position restoration. Task and project searches retain their existing name/title matching behavior; notes do not add search matches. Saving notes keeps the current completion, priority, due range and search controls and re-evaluates their membership under the existing rules. Archived tasks show their saved notes but both the notes textarea and Save notes button are disabled. Restoring a project makes its notes editable again. Upgrades preserve all pre-existing task data and initialize only the new notes field as empty.
