# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`; `GET /health` returns `{"status":"ok"}`.
Projects and their tasks (including completion state) are stored in the configured
SQLite file, which must be retained across restarts. Open a project to create tasks,
toggle completion, and filter by All, Open, or Completed. The project list defaults
to Active; select Archived to open or restore archived projects. Archived project
pages are read-only, including the rename controls. Active projects can be renamed
with New project name and Rename project without changing their URL or tasks.
Each task row has New task title and Rename task controls; renaming preserves
its order, ownership and completion state. Each task also has a Task priority
selector (Low, Normal, High). Default task priority on each project starts at Normal
and determines the priority of subsequently created tasks only. Project defaults
persist independently and are disabled while archived. Priorities persist independently
and survive renaming. Priority filter (All, Low, Normal, High) combines with
Task filter; both selections are retained through task edits. Matching tasks stay
in creation order. Archived task rename and priority controls are disabled,
but both filters remain usable. Each task has a Task due date textbox and Save due date
button. Dates accept real Gregorian days in YYYY-MM-DD format (years 0001–9999);
blank values clear the date. Invalid dates leave the saved value unchanged. Due dates
persist independently, survive renaming, and are read-only while archived.
Due from and Due through apply an inclusive due-date range that intersects both
combobox filters. Blank boundaries are unbounded; undated tasks match only when
both boundaries are blank. Invalid ranges leave the previous applied range intact.
The applied range and both selections survive task/project edits, while reopening
from the project list resets them. Range controls remain usable while archived.
Project rows show completed/total task counts. Existing
SQLite databases are migrated automatically to preserve projects and tasks.

Verify:

```sh
npm test
```

Tests use a temporary SQLite database outside the repository and check health,
validation, ordering, safe rendering, navigation, task ownership, completion,
filtering, archive/restore, completion summaries, database migration, read-only
archived pages, project and task rename validation and identity preservation,
task priority defaults, migration, independence and validation, combined filters
and selection preservation through edits, project default migration and inheritance,
independence and archive/restore behavior, due-date calendar validation, clearing,
migration, filter preservation and archived controls, inclusive due ranges,
range validation, combined membership and preservation through edits, and persistence
across restarts.
