# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step are needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects, view completion summaries, and filter Active or Archived projects. Archive projects from their rows and restore them from the Archived list. Each project page lets you create tasks, check or uncheck completion, and filter by All, Open, or Completed. Archived projects retain their tasks and allow viewing and filtering, while task creation and completion changes are disabled. Projects, tasks, and archive state persist in the configured SQLite file; existing databases are migrated automatically. `GET /health` returns `{"status":"ok"}`.

Active project pages also provide New project name and Rename project controls. Renaming trims whitespace, requires a nonblank name, and preserves the project URL, creation order, tasks, and completion summary. Archived projects cannot be renamed; restoring them enables renaming again. Names persist across reloads and server restarts.

Each task row provides New task title and Rename task controls. Renaming trims whitespace, requires a nonblank title, and updates the completion checkbox label while preserving ownership, creation order, completion state, filter membership, and summaries. Archived projects disable task renaming; restoration enables it again. Task titles persist across reloads and server restarts.

Each task row also has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal; new tasks inherit their project’s saved default priority. Priority changes persist independently for each task without changing completion, titles, ownership, ordering, or summaries. Archived projects disable priority changes; restoration preserves and enables them.

Each project page also provides a Priority filter with All, Low, Normal, and High options. It combines with Task filter, preserving both selections through edits and validation errors. Completion and priority changes immediately update the matching rows in creation order; summaries continue to count every task. Both filters remain usable on archived projects. Opening a project from the list starts both filters at All.

Each project page provides a Default task priority selector with Low, Normal, and High options, initially Normal. Changes apply only to subsequently created tasks in that project and preserve existing tasks, summaries, and both selected filters. Defaults persist through reloads, server restarts, renaming, archival, and restoration. Archived projects display the saved default in a disabled selector.

Every task row provides a Task due date textbox and Save due date button. Dates are optional: a blank value clears the date, and nonblank values must be real Gregorian dates in YYYY-MM-DD format with years 0001–9999. Surrounding whitespace is trimmed. Invalid values show an alert and preserve the saved date. Dates persist independently across reloads and restarts without timezone conversion, preserving all other task data, summaries, and selected filters. Archived projects disable date editing; restoration preserves dates and enables editing again. Existing databases migrate with empty due dates.

Run the integration checks with `npm test`. Tests use isolated temporary databases and verify project and task validation, creation order, escaping, navigation, project isolation, filtering, migration, archive/restore, archived task protection, completion summaries, project and task renaming, priorities, ownership protection, archived edit protection, combined filter intersections and selection retention, project default migration and independence, default inheritance for future tasks, and persistence after server restarts.
Due-date checks also cover leap years and century boundaries, year limits, invalid formats, clearing, task independence, retained filters, migration, and archive/restore protection.

Project pages include Due from and Due through textboxes and Apply due range. Ranges use inclusive Gregorian calendar dates and intersect completion and priority filters. A blank side is unbounded; tasks without dates match only when both sides are blank. Invalid or reversed ranges show an alert and preserve the previous applied range and visible tasks. Edits, renames, task creation, and default-priority changes retain all applied filters; task changes immediately update membership. Summaries count every task. Archived projects allow range filtering while task editing remains disabled. Opening a project from the list starts with empty boundaries.

The integration suite also checks due-range boundary inclusion, one-sided ranges, undated tasks, combined filter intersections, invalid-range retention, edit re-evaluation, archived filtering, and persisted task data after restart.

Each task row includes Destination project and Move task controls. Destinations are other active projects in project creation order, using their current names. Moving appends the task after the destination's existing tasks and preserves title, completion, priority, and due date. The source stays open with all applied filters retained, and both summaries reflect current ownership. Task order and ownership persist across restarts; existing databases migrate without changing task order. Archived projects cannot send or receive tasks. Move controls are disabled on archived sources or when no eligible destination exists. Restoration enables moving to eligible destinations again.

Move integration checks cover migration, destination names and ordering, append ordering for older tasks, subsequent creation, repeated moves, blank dates, source filter retention, summaries, ownership protection, archive restrictions, empty destinations, restoration, and restart persistence.
