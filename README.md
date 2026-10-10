# Workboard

Requires Node.js 22.22.1. No dependencies need installing.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; `/health` returns JSON health status. Projects and their tasks (including completion state) are stored in the configured SQLite file. Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. Combine this with the Priority filter (All, Low, Normal, High); both selections remain unchanged during task edits, and only tasks matching both filters appear in creation order. Filters remain usable in archived projects and do not affect completion summaries. Filter the project list by Active or Archived, archive projects, or restore them without losing tasks. Active project pages support renaming projects and individual tasks without changing their identity, order, ownership, or completion state. Each task has a saved Low, Normal, or High priority, independent of its title and completion. Each project has a saved Default task priority (initially Normal); new tasks inherit it, while existing tasks are unchanged. Defaults persist through renaming, archival, restoration, and restarts without resetting task filters. Archived projects remain viewable with read-only tasks and disabled rename, priority, and default-priority controls. Each project row shows its completed/total task count. Defaults are port 8080 and `data/workboard.sqlite`.

Verify:

```sh
npm test
```

Tests use a temporary database and verify project and task creation, blank-input validation, ordering, escaping, detail navigation, project isolation, completion toggling, filtering, archive/restore, read-only archived tasks, completion summaries, rename validation and identity preservation, archived project and task rename protection, task rename validation and ownership preservation, priority defaults and edits, priority validation and ownership protection, archived priority controls, all combined filter intersections, preserved filter selections and immediate row re-evaluation after edits, archived combined filtering, legacy schema migration (including existing tasks), project-default migration, independent defaults and inheritance, unchanged existing tasks and filter selections, archived default protection, and persistence across server restarts.
