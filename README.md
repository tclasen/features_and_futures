# Workboard

Requires Node.js 22.22.1. Uses only built-in Node modules and browser APIs; no dependency installation is needed.

Run:

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default and creates `data/workboard.sqlite`. Configure the port and persistent database file with:

```sh
PORT=8080 DB_PATH=/absolute/path/workboard.sqlite npm start
```

Open `/` to create projects and open their pages. `GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

The integration test uses a temporary database and verifies validation, creation order, HTTP routes, and project persistence across process restarts.
