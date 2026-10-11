# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Both variables are optional and default to the values above. The server binds to `0.0.0.0`. SQLite stores projects, tasks, and completion state across restarts. Open a project to create tasks, toggle completion, or filter by All, Open, and Completed. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

Tests start isolated server processes and remove their temporary database directories after checking validation, creation order, navigation, task filters, project isolation, and restart persistence for both completed and open tasks.
