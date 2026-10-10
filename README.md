# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Start the application:

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). `DB_PATH` selects the persistent SQLite file (default `data/workboard.sqlite`); its parent directory is created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project names are trimmed, required, and escaped when rendered. Projects are listed by their persistent creation IDs. Form submissions redirect after successful creation so refreshing the list does not create another project.

Project pages support task creation, completion checkboxes, and All/Open/Completed filters. Task titles are trimmed and required. Tasks belong to their project, and completion persists in SQLite. Filter selections are stored in the page URL; task submissions preserve the current filters and applied due range. The browser submits completion and filter changes automatically.

The project list starts with Active projects and supports an Archived filter. Archive and restore preserve project IDs, tasks, and completion state. Archived project pages allow task filtering but disable creation and completion changes; the server also rejects these mutations. Each project row shows completed/total counts across all its tasks. Existing databases are migrated automatically, with existing projects remaining active.

Active project pages support renaming with a trimmed, required name. Renaming preserves the project's URL, creation order, tasks, and completion counts. Archived projects disable rename controls and reject rename requests; restoring a project enables renaming again. Names persist across reloads and server restarts.

Each task row supports renaming with a trimmed, required title. Renaming preserves ownership, creation order, completion state, filter membership, and project summaries, while updating the completion checkbox label. Archived projects disable task rename controls and reject rename requests. Restoring a project enables task renaming again. Task titles persist across reloads and process restarts.

Each task row has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal when migrated; new tasks inherit their project's saved default. Priority changes persist independently without changing task titles, completion, ownership, order, filters, or project summaries. Renaming preserves priority. Archived projects disable priority selectors and reject priority changes; restoration enables them with their saved values. Invalid priority values are rejected without modifying data.

Each project page also has a Priority filter with All, Low, Normal, and High options. Both task filters start at All when opening a project from the list. Tasks must match both selected filters and retain creation order. Changing either filter preserves the other selection. Completion and priority edits immediately re-evaluate the rows after submission; renaming retains filter selections. Filters remain enabled in archived projects. Filtering never changes saved tasks or project summaries.

Each project page has a Default task priority selector with Low, Normal, and High options, initially Normal. Changes affect only subsequent task creation in that project and preserve existing tasks, both selected filters, and completion summaries. Defaults persist independently across reloads, restarts, project renaming, archive, and restore. Archived projects display a disabled selector and reject default changes on the server. Existing databases are migrated without changing task priorities or project identity.

Each task row has a Task due date textbox and Save due date button. Dates are optional: empty or whitespace-only input clears the saved date. Other values are trimmed and must be real Gregorian calendar dates in YYYY-MM-DD format with years 0001–9999. Validation uses calendar arithmetic without timezone conversion; invalid input leaves the saved date and other task data unchanged. Due dates persist independently through renaming, reloads, restarts, archive, and restore. Saving preserves both filters and completion summaries. Archived projects disable due-date controls and reject date changes on the server. Existing tasks migrate to empty dates.

Each project page has Due from and Due through textboxes with an Apply due range button. Applying a range trims and validates calendar dates using the same rules as task due dates. Boundaries are inclusive; a blank boundary is unbounded. Undated tasks match only when both boundaries are blank. The range intersects completion and priority filters and retains creation order without affecting saved data or all-task summaries. Invalid dates or reversed boundaries show an alert and preserve the previously applied range. Applied ranges are kept in the page URL and carried through every edit and filter submission, separately from draft range inputs. Opening a project from the list starts with empty boundaries. Range controls remain usable in archived projects.

Each task row has a Destination project selector and Move task button. Destinations are other active projects, listed by project creation order with their current names. Moving to a project for the first time appends the task after all positions already established there, including positions of tasks currently elsewhere. Returning to a previous project restores the task's remembered position relative to that project's other tasks. Each move preserves its ID and current title, completion, priority, and due date. The source stays open with its filters and applied range unchanged, and both summaries reflect their current tasks. Archived sources and destinations are rejected on the server; move controls are disabled for archived sources or when no destination is eligible. Persistent per-project task positions preserve existing order during migration and restore relative order even when multiple tasks return in a different order. Task creation and moves save ownership and positions in SQLite transactions. Project renaming, archive/restore, and server restarts retain remembered positions.

The project list supports Project search with a Search projects button; project pages support Task search with a Search tasks button. Searches match substrings while ignoring ASCII letter case and trimming surrounding query whitespace only; internal whitespace and non-ASCII letter case remain significant. Project search intersects Active/Archived filtering. Task search intersects completion, priority, and applied due-range filters. Applied queries are carried in the page URL and forms so filter changes and task edits retain them and immediately re-evaluate visible membership without changing saved data or all-task summaries. Search remains enabled in archived projects. Opening a project from the list starts with empty task search and due boundaries; visiting the list or returning through Projects starts with empty project search. Clearing a search shows all rows matching the other filters.

Run syntax checks and integration tests:

```sh
npm run check
npm test
```

The integration tests start real server processes on ephemeral ports and verify validation, creation order, escaping, task filtering, project isolation, completion updates, archive/restore, renaming without identity changes, independent task priorities, all combined priority/completion filters, filter retention during edits, completion summaries, archived mutation rejection, due-date calendar boundaries and clearing, inclusive due ranges intersecting both filters, invalid-range preservation, range retention during edits, task moves and destination validation, independent remembered return positions, reverse-order returns, arrivals after absent positions, project/task search intersections and query retention, ASCII-only case matching, significant internal whitespace, database migration, and restart persistence using temporary databases that are removed afterward.
