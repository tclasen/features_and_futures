# Workboard

Projects application using Node.js 22.22.1, JavaScript ES modules, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No installation or external dependencies are required.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. The database is created automatically and reused across restarts. `GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

The integration test uses an isolated temporary SQLite file and checks validation, trimmed names, creation order, page routes, health, and persistence of names and IDs across server restarts.
