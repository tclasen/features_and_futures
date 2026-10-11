# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Both variables are optional and default to the values above. SQLite stores project names and IDs across restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

Tests start isolated server processes and remove their temporary database directories after checking validation, project creation order, detail navigation, and restart persistence.
