# Workboard

Requires Node.js 22.22.1. Uses only built-in Node modules; no installation is needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to
`8080`; `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file
to preserve projects, archive state, tasks, and completion state across restarts.

Open a project to create tasks, toggle their completion checkboxes, and choose
All, Open, or Completed in the Task filter. Tasks belong to their project and
appear in creation order. The Priority filter offers All, Low, Normal, and High;
only tasks matching both filters appear. Opening a project starts both filters
at All. Filter selections stay in place when either filter changes or a task is
edited; changing completion or priority immediately updates the matching rows.
Both filters work while archived, and project summaries always count all tasks.

Use New project name and Rename project on an active project page to rename it.
Names are trimmed and must not be blank. Renaming preserves the project's URL,
creation order, tasks, and completion state, and persists across restarts.
Archived projects cannot be renamed until restored.

Each task row has New task title and Rename task controls. Task titles are
trimmed and must not be blank. Renaming preserves ownership, creation order,
completion state, filter membership, and project summaries across restarts.
Task renaming is disabled while the project is archived and enabled on restore.

Each task has a Task priority selector with Low, Normal, and High options.
Existing and new tasks default to Normal. Priority changes persist across
restarts and preserve task titles, completion, ordering, ownership, and summaries.
Archived projects disable priority changes; restoring enables them again.

The Project filter starts with Active projects. Archive a project to move it to
Archived, or restore it to return it to Active. Each project shows its completed
and total task counts. Archived projects remain readable with working task
filters; task creation and completion changes are disabled until restoration.
Existing database files are migrated automatically, preserving their data.

Health check:

```sh
curl http://localhost:8080/health
```

Verification:

```sh
npm test
```

The integration tests start real server processes, use temporary SQLite
databases, and check project and task validation, ordering, navigation, HTML
escaping, task filtering and ownership, completion changes, and persistence
after restarts, legacy database migration, archive/restore, summaries, and
archived-project mutation protection, and project and task renaming with identity
and data preservation, task priorities including migration and persistence, and
combined completion/priority filtering with edits and archive/restore.
