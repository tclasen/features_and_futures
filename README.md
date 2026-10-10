# Workboard

Requires Node.js 22.22.1. Uses JavaScript ES modules, Node's built-in HTTP
server and SQLite, and browser HTML/CSS/JavaScript. No packages need installing.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults
to `./data/workboard.sqlite`. Keep the database file to retain projects across
restarts. The database parent directory is created automatically.

Visit `/` to create and open projects. `GET /health` returns
`{"status":"ok"}`. Names are trimmed and must not be empty; project IDs are
stable and projects appear in creation order.

Run integration tests:

```sh
npm test
```

Tests use a temporary database outside the repository and check validation,
creation order, the health endpoint, detail routes, and restart persistence.
