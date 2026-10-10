# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080`, and `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is created automatically. Keep the same database file to preserve projects across restarts.

Open `http://localhost:8080/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run verification:

```sh
npm test
node --check server.js
node --check public/app.js
```

The integration test uses a temporary SQLite database and verifies validation, creation order, project lookup, page routes, health, and persistence after a server restart.
