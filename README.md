# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`.
`PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`.
Use the same database path across restarts to retain projects, tasks, completion state,
archive state, renamed project names and task titles, task priorities, project task-priority defaults,
task due dates, and remembered task positions in each visited project. Existing
databases are upgraded automatically without changing their current task order.
`GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

Each project page supports task creation, completion checkboxes, and an All/Open/Completed
filter. A Priority filter offers All, Low, Normal, and High, initially All. Tasks must
match both filters and remain in creation order. Changing either filter or editing
a task keeps both selections; completion and priority edits immediately refresh the
matching rows. Both filters work in archived projects and leave summary counts unchanged.
New tasks are open, and both project names and task titles are trimmed.
The project list starts with Active projects and can show Archived projects. Archive
and restore preserve tasks; archived project pages allow viewing and filtering but
disable task creation and completion changes. Each project row summarizes completion
across all its tasks.

Active project pages provide New project name and Rename project controls. Renaming
trims the name and preserves the project's URL, creation order, tasks, and completion
summary. Blank names show an alert. Archived projects disable renaming until restored.

Each task row provides New task title and Rename task controls. Renaming trims the
title and preserves task identity, ownership, creation order, completion state, and
summary counts. Blank titles show an alert. Archived projects disable these controls
until restored.

Each task row has a Task priority combobox with Low, Normal, and High options.
Existing tasks default to Normal during migration. Priority changes persist independently
without affecting titles, completion, order, ownership, or summaries. Archived
projects disable priority editing until restored.

Each project page has a Default task priority combobox with Low, Normal, and High
options. Projects initially default to Normal; new tasks inherit the project's saved
default. Changing the default leaves existing tasks and both filter selections alone.
Defaults persist independently through reloads, restarts, renaming, and archive/restore.
Archived projects display their saved default with editing disabled until restored.

Each task row has a Task due date textbox and Save due date button. Dates start empty;
saving whitespace clears them. Nonempty values are trimmed and must be real Gregorian
dates in YYYY-MM-DD format, with years 0001 through 9999. Invalid dates show an alert
and preserve the saved date. Dates are stored as calendar-day text without timezone
conversion. Saving dates leaves task identity, other fields, filters, and summaries
unchanged. Archived projects disable both controls until restored.

Each project page provides Due from and Due through textboxes and Apply due range.
Applied boundaries are inclusive and intersect completion and priority filters.
Blank boundaries are unbounded; undated tasks match only when both are blank.
Invalid dates or reversed boundaries show an alert and retain the last applied range.
Task edits immediately refresh matching rows. Renames, creation, and default changes
retain all applied filters. Range controls work in archived projects, and reopening
a project starts with empty boundaries. Calendar validation is shared with due-date
saving so both use the same Gregorian rules without timezone conversions.

The integration test uses an isolated database, exercises project and task validation,
creation order, project isolation, and completion updates, and restarts the server to
verify persistence, database migration, archive/restore, and completion summaries.
The browser-code interaction test uses a small DOM harness to check task validation,
filtering, checkbox updates, save-error recovery, project archive/restore, summaries,
archived page controls, and renaming without external dependencies. Integration checks
also verify rename validation, identity preservation, archived restrictions, and
renamed names surviving server restarts. Priority checks cover migration of existing
tasks, defaults, independent edits, invalid values, save-error recovery, unchanged
completion summaries, and priority persistence through renaming, archive/restore,
filter changes, and server restarts.
Combined-filter checks cover every completion/priority combination, selection retention,
task edits leaving the matching list, rename membership, and archived filtering.
Project-default checks cover migration, independent defaults, future-task inheritance,
unchanged existing tasks and filters, save-error recovery, archived restrictions,
renaming, restoration, and restart persistence.
Due-date checks cover empty defaults and migration, leap years and calendar boundaries,
invalid-value rejection, trimming, clearing, independent values, unchanged task data
and summaries, retained filters, rename preservation, archived controls, and restart
persistence.
Due-range checks cover inclusive and one-sided boundaries, undated tasks, every
completion/priority combination, invalid calendar dates and reversed ranges,
unapplied text, edit-triggered membership changes, selection retention, archived
filtering, empty initial boundaries, and accessible controls.

Each task row provides Destination project and Move task controls. Destinations are
other active projects in project creation order, using their current names. Moving
appends a first arrival after the destination's established positions. Returning tasks
reuse their remembered position in that project, even when multiple tasks return in
a different order. New tasks follow established positions, including those held by
tasks currently away. Moves preserve identity, current title, completion, priority,
and due date. The source page stays open with all its filters retained;
both project summaries reflect current ownership. Archived projects cannot send or
receive tasks, and moving is disabled when no destination is available. Moves and
the resulting task order persist across restarts. Move checks cover saved data,
ordering, summaries, repeat moves, archived restrictions, empty destinations,
filter retention, error recovery, and persistence. Return-order checks cover migration
of sparse existing positions, reverse returns, new tasks while originals are away,
multiple visited projects, current fields after edits elsewhere, project renaming,
archive/restore, completion summaries, and repeated process restarts.

Project search and Search projects apply a trimmed substring query to project names,
intersecting the Active/Archived filter. Task search and Search tasks use the same
rules for task titles and intersect completion, priority, and the applied due range.
Only ASCII letter case is ignored; internal query whitespace remains significant.
Search retains the other filters and all-task summaries. Task edits, renames,
creation, and moves immediately refresh membership without resetting search.
Search works on archived projects while editing remains disabled. Opening a project
or returning to Projects starts with an empty search. Search interaction checks cover
these intersections, query rules, retained selections, edit-triggered membership,
archived controls, and empty queries on new page loads.
