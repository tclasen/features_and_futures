# Workboard

Requires Node.js 22.22.1. There are no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the default port is 8080 and the default database is `./data/workboard.sqlite`. Keep the database file to preserve projects across restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

The checks use a temporary SQLite file and verify validation, creation order, project retrieval, page serving, and persistence after a server restart.
