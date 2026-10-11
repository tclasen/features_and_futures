# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects, view completion summaries, and filter Active or Archived projects. Archive and restore projects from their rows. On each project page, create tasks, toggle their completion, and filter by All, Open, or Completed combined with All, Low, Normal, or High priority. Both filters retain their selections during edits and show matching tasks in creation order; opening a project from the list starts with both set to All. Active projects can be renamed with a trimmed, nonblank name without changing their identity, order, or tasks. Each task row supports renaming with a trimmed, nonblank title, preserving ownership, order, completion and summaries. Each task also has an independent Low, Normal, or High priority that persists without changing its other data. Each project has a saved Default task priority, initially Normal; newly created tasks inherit it, while existing tasks remain unchanged. Changing this default preserves both task filters. Defaults persist across renaming, archival, restoration and restarts, and the default control is disabled when archived. Each task has an optional Task due date textbox and Save due date button. Saving trims the input; an empty value clears the date, and nonempty values must be real Gregorian dates in YYYY-MM-DD format (years 0001–9999). Invalid dates show an alert without changing saved data. Due dates persist independently and preserve both filters and other task data. Project pages also provide Due from and Due through textboxes and Apply due range. Valid trimmed boundaries filter dates inclusively, intersecting completion and priority filters; blank sides are unbounded, and undated tasks match only when both sides are blank. Invalid dates or reversed ranges show alerts and retain the previous applied range. Edits and combobox changes retain the applied range, while reopening from the project list starts with blank boundaries. Each task row offers Destination project and Move task controls. Destinations are other active projects in project creation order. Moves keep the source page and its filters open, append first-time arrivals after all positions established in the destination, and restore returning tasks to their remembered position for that project. Positions are remembered independently per project, including while tasks are away, and persist across restarts, project renames, archival and restoration. Moves preserve task identity, title, completion, priority and due date. Both project summaries update. Moves are disabled without eligible destinations or in archived projects; archived projects cannot receive tasks. Archived projects remain readable and filterable but cannot be renamed or have tasks created, renamed, reprioritized, due dates edited or completion changed. Projects, names, archive state, and tasks persist in the configured database across restarts; existing databases are migrated automatically. `GET /health` returns `{"status":"ok"}`.

Project search and Task search match trimmed queries by substring, ignoring ASCII letter case and treating each run of ASCII spaces and horizontal tabs as one space in both query and name/title. This normalization is for matching only; saved names and titles retain their original whitespace and case. Searches intersect their page's existing filters and preserve creation/remembered order. Filter changes and edits retain the applied query; task edits immediately re-evaluate membership. Searches remain usable in archived projects, do not change stored data or summary counts, and begin empty when navigating from the list or returning with Projects.

Each task row has a Task notes textarea and Save notes button. Notes are optional plain text, saved without trimming, including whitespace, line breaks, Unicode and literal markup. They persist and travel with tasks through moves and remembered returns without changing other task data. Saving retains all filters and the title-only search query; notes never add search matches. Archived notes remain visible with editing disabled. Existing databases gain empty notes without changing prior data.

Live task rows provide Delete task. Deletion preserves all fields and remembered positions but removes the task from All, Open, Completed and completion summaries. The fourth Task filter option, Deleted, shows deleted tasks intersecting priority, due range and title search. Deleted fields and move controls are read-only; Restore task returns a task to its reserved position with its saved fields unchanged. Both actions preserve current filters and are disabled in archived projects. Deletion persists across restarts; upgrades initialize existing tasks as live.

Run the integration tests (using temporary databases outside the repository):

```sh
npm test
```
