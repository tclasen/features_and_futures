# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The SQLite file retains project names and IDs across restarts. `GET /health` returns `{"status":"ok"}`.

Projects are created using the labelled form, listed in creation order, and opened using their row's `Open project` button. The `Projects` button returns to the list. Blank names show a validation alert without creating a project.

Run the automated HTTP and restart-persistence checks:

```sh
npm test
```

Tests use a temporary database outside the repository and remove it afterwards.
