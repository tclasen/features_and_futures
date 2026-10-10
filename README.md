# Workboard

Requires Node.js 22.22.1. No package installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Both environment variables are optional; the values above are the defaults. The configured SQLite file preserves projects, their tasks, and task completion across restarts. Open a project to create tasks, change completion, and filter by All, Open, or Completed.

The project list initially shows Active projects. Each row includes its completed/total task summary and an Archive project button. Select Archived to open or restore archived projects. Archived project pages keep task filtering available and disable task creation and completion changes. Archive state persists, and existing databases are migrated automatically without losing projects or tasks.

Active project pages provide New project name and Rename project controls. Renaming trims whitespace and preserves the project URL, list position, tasks, and completion summary. Blank names show an alert; archived projects disable renaming until restored. Names persist across reloads and restarts.

Each task row provides New task title and Rename task controls. Renaming trims whitespace and preserves the task's project, position, completion and summary counts. Blank titles show an alert. Archived projects disable these controls until restored. Task titles persist across reloads and restarts.

Health check:

```sh
curl http://localhost:8080/health
```

Run the integration tests, including a process restart against the same database:

```sh
npm test
```
