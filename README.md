# Workboard

A projects and tasks application using Node.js 22.22.1, ES modules, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No package installation or external dependencies are needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. Keep that database file to preserve projects, tasks, completion state, and archive state across restarts. Its parent directory is created automatically. Existing databases receive the task table and project archive column automatically without losing saved data. `GET /health` returns `{"status":"ok"}`.

Open `http://localhost:8080` to create and open projects. Names are trimmed before saving; empty names display a validation alert. Projects appear in creation order. Forms use standard browser navigation and work without client-side scripting.

Inside a project, create tasks with trimmed titles, mark them complete or open using their checkboxes, and filter by All, Open, or Completed. Each project owns its tasks, displayed in creation order. The filter defaults to All and is stored in the page URL when changed. JavaScript submits checkbox and filter changes automatically; without scripting, explicit save and apply buttons are available.

The project list defaults to Active; choose Archived to see archived projects. Every row shows completed/total task counts, independent of task filters. Archive project moves a project to Archived, where Open project and Restore project remain available. Archived project pages retain task filtering but disable task creation and completion changes. The server also rejects task changes to archived projects with HTTP 409. Restoration preserves task IDs, titles, and completion state and returns the project to its original creation order in Active.

Verification:

```sh
npm test
node --check server.js
node --check test/projects.test.js
```

The integration tests use temporary SQLite databases to check project and task validation, escaping, ordering, navigation, project isolation, completion changes, filtering, archive/restore, completion summaries, and server enforcement of archived-project restrictions. They also verify migration from earlier schemas and persistence across server restarts.
