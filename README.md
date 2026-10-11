# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Create a project, then open it to create tasks, toggle completion, and filter by All, Open, or Completed. The project list shows completion summaries and filters Active or Archived projects. Archive or restore a project from its row; archived project pages allow viewing and filtering tasks with creation and completion controls disabled.

The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the configured SQLite file to retain projects, tasks, completion state, and archive state across restarts. Existing databases are migrated automatically. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

The checks use a temporary database under the ignored `data/` directory and remove it on completion. They cover schema migration, validation, trimming, creation order, project retrieval, task isolation, completion updates, archive/restore, summaries, archived mutation rejection, served routes, health, and persistence across process restarts.
