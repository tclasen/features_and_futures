# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Create a project, then open it to create tasks, toggle completion, and filter by All, Open, or Completed. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the configured SQLite file to retain projects, tasks, and completion state across restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

The checks use a temporary database under the ignored `data/` directory and remove it on completion. They cover validation, name and title trimming, creation order, project retrieval, task isolation, completion updates, served routes, health, and persistence across process restarts.
