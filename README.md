# Workboard

Requires Node.js 22.22.1; no dependencies or install step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `./data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.

```sh
npm test
```

Project pages support task creation, completion checkboxes, and combined All/Open/Completed and All/Low/Normal/High priority filtering. Both filters retain their selections during task edits and remain usable in archived projects. The project list provides Active/Archived filtering, archive/restore controls, and completion summaries. Active project pages also support project and task renaming without changing identity, ownership, order, or completion state. Each task has an independent Low/Normal/High priority, defaulting to Normal. Archived project pages are read-only, including rename and priority controls. Projects, names, tasks, priorities, and archive state are saved in SQLite; existing databases are migrated automatically.

Browser-script tests exercise combined filter combinations, edit-driven row updates, selection preservation, and archived controls using a dependency-free DOM adapter. Server tests exercise health, project/task validation, creation order, project isolation, completion changes, detail routes, schema migration, archive/restore, read-only enforcement, summaries, project/task rename validation and identity preservation, priority defaults/validation/isolation and migration of existing tasks, and SQLite persistence across process restarts using a temporary database.
