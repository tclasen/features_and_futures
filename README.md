# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Create a project and open it to create tasks, toggle completion, and filter by All, Open, or Completed. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to preserve projects, tasks, and completion across restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

Tests use a temporary SQLite database and verify validation, creation order, project isolation, completion updates, the page and asset routes, and persistence across server restarts.
UI event-handler checks use a minimal DOM adapter to verify task validation, checkbox names, completion changes, and filter behavior without external dependencies.
