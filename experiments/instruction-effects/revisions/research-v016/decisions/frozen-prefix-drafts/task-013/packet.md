Work only in your assigned repository on the current task. Implement the supplied requirements using the specified technology stack. Preserve the previously required behavior. Use the shared launch and health interfaces. Manage your own Git history and submit an exact commit plus the required run commands. Work within the supplied tool and resource limits. If verification fails, use the factual feedback to revise your submission. Do not access PM files, other builders, or their artifacts. Do not work ahead on undispatched tasks.

# Workboard pilot workload

Workboard is a browser application whose business behavior is defined only by the current cumulative task packet. Implement the disclosed requirements checkpoint; future features and the PM backlog are not part of this packet. Do not expose business controls for undispatched features. Presentation choices and internal architecture remain independent.

Every builder uses Node.js 22.22.1, JavaScript ES modules, built-in HTTP (node:http) and SQLite (node:sqlite), and browser HTML/CSS/JavaScript. No external application dependencies are required or permitted in this pilot. This keeps package installation and network access outside the measured feature work.

The shared start command is `npm start`. The server entry point is `server.js`; internal module layout is independent. Bind to `0.0.0.0` at `PORT` (default 8080). Use the SQLite file at `DB_PATH`, preserving data across process restarts. Serve `GET /health` as JSON `{"status":"ok"}`.

Requirements specify accessible UI labels and observable row boundaries for a common acceptance surface. The PM's Playwright source remains outside builder sandboxes. Application code and tests are independently owned by each builder.

The pilot verifies measurement and orchestration, not an instruction effect. A main run may grow this workload through additions and revisions after its evidence method has been frozen.

Submission boundary: `git status --porcelain` must be empty at submission, including runtime and untracked files. The submitted commit is the exact application tree the PM will validate.


Cumulative requirements through this task:

# Task 001: Projects

Build the initial Workboard application using the specified stack and shared launch contract.

- At `/`, show the heading `Workboard`, a textbox labelled `Project name`, and a button `Create project`.
- Creating a project trims its name. A blank or whitespace-only name leaves the list unchanged and displays a visible alert containing `Project name is required`.
- Display projects in creation order. Each project has a visible row with `data-testid="project-row"`, its name, and a button `Open project`.
- Opening a project navigates to `/projects/<project-id>`, shows its name as a heading, and provides a `Projects` button to return to the list.
- Project names and IDs persist across page reloads and server-process restarts using the configured SQLite file.
- `GET /health` returns HTTP 200 and JSON `{"status":"ok"}`.
- Start with `npm start`, binding to `0.0.0.0` at `PORT` (default 8080), and store data at `DB_PATH`. No external application dependencies are permitted.
- Commit your implementation in your independent Git repository. Leave relevant source changes committed and report the submitted commit ID. Do not modify the assigned technology stack or work ahead on undispatched features.

# Task 002: Tasks within projects

Preserve all Task 001 behavior.

- On each project page, provide a textbox `Task title` and button `Create task`.
- Task creation trims its title. Blank or whitespace-only input leaves tasks unchanged and displays an alert containing `Task title is required`.
- Show each task in a row with `data-testid="task-row"`, its title, and a checkbox whose accessible name is `Complete <task-title>`.
- New tasks are open. Checking or unchecking completion updates the saved state.
- A combobox labelled `Task filter` has visible options `All`, `Open`, and `Completed`. Initially select `All`; display the matching tasks in creation order.
- Tasks are owned by their project: other project pages never show them.
- Project-page URLs remain usable after reload. Tasks and completion state persist across reloads and server-process restarts.
- Commit your implementation and report its exact commit ID.

# Task 003: Archive/restore and completion summaries

Preserve all Tasks 001 and 002 behavior.

- The project list has a combobox labelled `Project filter` with options `Active` and `Archived`, initially `Active`.
- Each active project row has an `Archive project` button. Archiving removes it from the Active list and adds it to the Archived list.
- Archived rows still have `Open project` and additionally `Restore project`. Restoration returns the project to Active without losing its tasks or completion state.
- An archived project page shows visible text `Archived project`, disables `Create task`, and disables all task completion checkboxes. Tasks remain visible and filtering works.
- Each project row includes `data-testid="project-summary"` with text `<completed-count>/<total-count> completed`. New projects show `0/0 completed`; the counts include all tasks regardless of the current task filter.
- Archive state, restored tasks, and completion counts persist across page reloads and process restarts.
- Commit your implementation and report its exact commit ID.

# Task 004: Rename projects while preserving their identity

Preserve all Tasks 001 through 003 behavior.

- An active project page has a textbox labelled `New project name` and a `Rename project` button.
- Renaming trims surrounding whitespace and changes the visible project heading and project-list name. The project's URL/identity, creation-order position, tasks, task completion states and completion summary stay the same.
- An empty or whitespace-only name leaves the original name unchanged and displays an alert containing `Project name is required`.
- The new name persists across reloads and server-process restarts.
- An archived project's rename textbox and button are disabled. After restoration, renaming is enabled again without losing any existing project data.
- Commit your implementation and report its exact commit ID.


# Task 005: Rename tasks while preserving completion and ownership

Preserve all Tasks 001 through 004 behavior.

- Each task row in an active project has a textbox labelled `New task title` and a `Rename task` button.
- Renaming trims surrounding whitespace and changes the visible task title and the completion checkbox's accessible label to `Complete <new-title>`.
- The task stays in its original project and creation-order position. Its completion state, filter membership and the project completion summary stay the same.
- An empty or whitespace-only new title leaves the old title unchanged and displays an alert containing `Task title is required`.
- The renamed title and completion state persist across page reloads and server-process restarts.
- Archived projects disable all task rename textboxes and buttons. Restoration enables them again without losing task data.
- Commit your implementation and report its exact commit ID.


# Task 006: Persistent task priorities

Preserve all Tasks 001 through 005 behavior.

- Each task row has a combobox labelled `Task priority`, with exactly `Low`, `Normal`, and `High` options in that order. Existing tasks and newly created tasks default to `Normal`.
- Selecting an option changes that task's priority. The selected option represents the saved priority after reload and server-process restart.
- Priority edits leave the title, completion state, project ownership, creation-order position, completion-filter membership, and project completion summary unchanged. Task renaming preserves priority.
- Priority belongs to each task independently; changing one task must not change another task or project.
- Archived projects disable every task priority combobox. Restoration enables them and preserves their saved values.
- Commit your implementation and report its exact commit ID.


# Task 007: Combined task priority and completion filters

Preserve all Tasks 001 through 006 behavior.

- Each project page has a combobox labelled `Priority filter`, with exactly `All`, `Low`, `Normal`, and `High` options in that order. Opening a project from the project list initially selects `All`.
- Display only tasks matching both the existing `Task filter` and the `Priority filter`. `All` matches every value on its own filter. Retain creation order among matching tasks.
- Changing either filter leaves the other selected value unchanged. Filter changes do not alter saved task data or the project completion summary, which still counts all tasks.
- Changing a task's priority or completion immediately re-evaluates the visible rows under both selected filters, without resetting either selected filter. The changed state persists using the existing rules.
- Renaming a task preserves both selected filter values, its priority, completion, and matching-filter membership.
- Both filters remain usable in archived projects. The existing archived task editing controls remain disabled, and restoration preserves task data.
- Commit your implementation and report its exact commit ID.


# Task 008: Project defaults for new task priorities

Preserve all Tasks 001 through 007 behavior, with the following change to new-task defaults.

- Each project page has a combobox labelled `Default task priority`, with exactly `Low`, `Normal`, and `High` options in that order. Existing projects and newly created projects initially use `Normal`.
- Changing this selection saves that project's default. Subsequent tasks created in that project inherit the saved default instead of always using `Normal`. Changing the default never changes any existing task, including tasks that previously inherited a default.
- Defaults belong to projects independently. They survive reload, server-process restart, project renaming, archival and restoration. Existing tasks retain title, priority, completion state, ownership and creation order; the project summary retains its existing all-task meaning.
- Changing the default leaves both selected task filters unchanged, and does not change which existing task rows match those filters.
- Archived projects display their saved default in a disabled combobox. Restoration enables it and preserves its value.
- Commit your implementation and report its exact commit ID.


# Task 009: Optional persistent task due dates

Preserve all Tasks 001 through 008 behavior.

- Every task row has a textbox labelled `Task due date` and a button labelled `Save due date`. New and existing tasks initially have no due date, shown as an empty textbox.
- Saving an empty or whitespace-only value clears the due date. Otherwise trim surrounding whitespace and accept only a real Gregorian calendar date in `YYYY-MM-DD` format, with a four-digit year from 0001 through 9999. Store and display the canonical date; it survives reload and server-process restart. Dates represent calendar days without timezone conversion.
- On an invalid nonempty value, show a visible alert containing `Due date must be a valid YYYY-MM-DD date`. Preserve the previous saved date and all other task data.
- Dates belong to tasks independently. Saving or clearing a date preserves title, completion, priority, project ownership, creation order, both selected filters and project completion summary. Task renaming preserves its due date.
- Archived projects disable the due-date textbox and save button for every task. Restoration enables both and preserves saved dates.
- Commit your implementation and report its exact commit ID.


# Task 010: Inclusive due-date range filtering

Preserve all Tasks 001 through 009 behavior.

- Each project page has textboxes labelled `Due from` and `Due through`, and a button labelled `Apply due range`. Opening a project from the project list initializes both fields to empty.
- Applying a range filters tasks by inclusive calendar-date boundaries. A blank boundary is unbounded on that side. When both boundaries are blank, dated and undated tasks all match. When either boundary is present, undated tasks do not match.
- The due range intersects both existing completion and priority filters. Matching rows retain creation order. Applying a range retains both selected combobox values; changing either combobox retains the applied range. The project summary continues to count all tasks.
- Trim surrounding whitespace. Nonblank boundaries must satisfy the Task009 calendar-date rules. On invalid syntax or impossible dates, show a visible alert containing `Due range must use valid YYYY-MM-DD dates`. If both dates are valid but from is after through, show a visible alert containing `Due from must not be after Due through`. Invalid applications preserve the previous applied range and visible membership.
- Saving a task due date, priority or completion immediately re-evaluates visible membership under all three filters. Task or project renaming, task creation and default-priority changes retain the applied range and both selected combobox values. None of the filters changes saved task data.
- Due-range controls remain usable in archived projects; existing task editing controls stay disabled. Restoration preserves all saved dates and task data. Reopening a project starts with empty due-range boundaries.
- Commit your implementation and report its exact commit ID.


# Task 011: Move tasks between active projects

Preserve all Tasks 001 through 010 behavior.

- Every task row has a combobox labelled `Destination project` and a button labelled `Move task`. The combobox lists active projects other than the task's current project, using their current project names in project creation order. It has no other options. If there are no eligible destinations, the combobox and move button are disabled.
- Moving a task removes it from its source project and appends it after the destination's existing tasks. Preserve the task's title, completion, priority and due date, including blank dates. The destination's default priority does not replace the moved task's priority.
- The source project remains open after moving. Preserve all its selected completion/priority filters and applied due-range boundaries. Remaining rows retain their prior creation order and matching membership.
- Both projects' completion summaries count their current tasks after the move. The moved task appears only in its destination, survives reload and server-process restart, and can be moved again using the same rules.
- Archived projects cannot be move sources or destinations. Archived task rows have disabled destination comboboxes and move buttons. Restoration enables moving to eligible active destinations without changing the saved task data.
- Commit your implementation and report its exact commit ID.


# Task 012: Restore task order when returning to a previous project

Preserve all Tasks 001 through 011 behavior, with this explicit revision to movement order.

- A task moving to a project it has never belonged to appends after that project's existing tasks, as before. A task returning to a project it previously belonged to returns to its previous position relative to that project's other tasks, rather than always appending.
- Preserve each task's ordering position separately for each project it has belonged to. Returning multiple tasks in a different order restores their previous relative order. Newly created tasks and tasks arriving for the first time come after the positions already established in that project.
- Project renaming does not change remembered task positions. Archived projects remain ineligible destinations; restoration makes them eligible again and preserves their remembered positions.
- Current task title, completion, priority and due date survive movement; restoring order does not restore older field values. Source filters, both project summaries, eligible destination choices and all archive restrictions keep their existing behavior.
- Task positions and remembered return behavior persist through reload and server-process restart. Existing tasks keep their current order when this feature is introduced.
- Commit your implementation and report its exact commit ID.


# Task 013: Project and task search

Preserve all Tasks 001 through 012 behavior.

- The project list has a textbox labelled `Project search` and a button labelled `Search projects`. Search matches project names by substring, ignoring ASCII letter case and trimming only surrounding query whitespace. Internal whitespace remains significant. A blank trimmed query matches all projects.
- Project search intersects the existing active/archived project filter. Changing that filter retains the applied query. Matching projects remain in project creation order and keep their all-task summaries. Opening the project list initially, or returning through `Projects`, begins with an empty search query.
- Each project page has a textbox labelled `Task search` and a button labelled `Search tasks`. It matches task titles with the same substring/case/whitespace rules. Opening a project from the list initializes an empty query.
- Task search intersects the existing completion, priority and due-range filters. Applying search retains all other selected filter values/boundaries; changing those filters retains the applied search query. Matching tasks retain their existing order.
- Task title renaming, date/priority/completion edits, movement, creation and project-default changes retain the applied task query and other filters, immediately re-evaluating visible membership. Search never changes stored task data or project summary counts.
- Task search remains usable in archived projects while task editing controls stay disabled. Clearing the query restores rows matching the other selected filters. All movement/return-position and persistence behavior remains intact.
- Commit your implementation and report its exact commit ID.
