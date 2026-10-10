# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules, with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is created automatically. Keep the same database path to preserve projects, tasks, and completion state across restarts.

Open a project to create tasks, check or uncheck completion, and filter the task list by All, Open, or Completed. Names and titles are trimmed; blank entries display a validation alert.

The project list starts with Active projects. Archive a project to move it to the Archived filter, then restore it there when needed. Archived projects remain readable with task filtering, but task creation and completion changes are disabled. Each project shows its completed/total task summary. Archive state and tasks persist in SQLite; existing databases are migrated automatically.

Use New project name and Rename project on an active project's page to change its name. Renaming preserves its URL, list position, tasks, and completion summary. Archived projects cannot be renamed until restored.

Each task row has New task title and Rename task controls. Renaming trims the title and preserves the task's project, position, completion state, and filter membership. Blank titles display a validation alert. Archived projects disable task renaming until restored.

Each task has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal. Priority is saved independently for each task and persists across restarts and renaming. Archived projects disable priority changes until restored.

Default task priority sets the priority for subsequent tasks in that project. Projects initially use Normal; changing the saved default leaves existing tasks and both task filters unchanged. Defaults persist across restarts, renaming, archival, and restoration. Archived projects display their saved default with the selector disabled.

Each project page also has a Priority filter with All, Low, Normal, and High options, initially All. It combines with Task filter to show tasks matching both selections in creation order. Edits and validation keep both filter selections; priority and completion changes immediately update the matching rows. Filters remain usable in archived projects and never change the completion summary.

Health check:

```sh
curl http://localhost:8080/health
```

Run the integration checks:

```sh
npm test
```
