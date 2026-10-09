# Workboard

Requires Node.js 22.22.1. Uses only built-in modules; no dependency installation is needed.

Start the application:

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). The default database is `data/workboard.sqlite`. To configure both:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `http://localhost:8080/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run verification:

```sh
npm test
node --check server.js
node --check public/app.js
```

The integration test starts the application using `npm start` and a temporary SQLite database, then verifies validation, creation order, project retrieval, page serving, health, and persistence after a process restart.
