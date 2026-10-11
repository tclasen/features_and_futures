# Workboard

Each task row provides New task title and Rename task. Titles are trimmed;
blank titles show an alert. Renaming preserves the task's project, order and
completion state, and persists across restarts. Archived projects disable task
renaming until restored.

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Configure `PORT` and `DB_PATH`
to select another port or persistent SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080/` to create and open projects. Within a project,
create tasks, toggle their completion, and filter by All, Open, or Completed.
Project URLs can be reloaded directly. Projects and tasks persist in SQLite.
The project list defaults to Active and can show Archived projects. Archive or
restore a project from its row; its completion summary includes all its tasks.
The selected project filter is kept within the browser session across reloads
and returning from a project page. New browser sessions start with Active.
Archived project pages allow viewing and filtering tasks, with task creation and
completion changes disabled. Archiving preserves tasks and their completion state.
Active project pages also allow renaming with New project name and Rename project.
Names are trimmed and cannot be blank. Renaming preserves the project URL,
creation order, tasks, and completion summary; archived projects cannot be renamed
until restored. The new name persists across reloads and server restarts.
`GET /health`
returns `{"status":"ok"}`. The default database is `data/workboard.sqlite`.

```sh
npm test
```

The integration test checks blank-name validation, trimming, creation order,
project routes, health, task validation and project isolation, completion updates,
archive/restore, completion summaries, archived-project write protection,
saved state after server restarts, and migration of existing SQLite data.
It also checks rename validation, identity and task preservation, archived rename
protection, and renaming again after restoration.
Browser-script regression tests use a DOM adapter to check filter retention,
archived-page controls, and switching filters during archive/restore requests.
