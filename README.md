# Workboard

Requires Node.js 22.22.1. Uses JavaScript ES modules, built-in HTTP and SQLite,
and browser HTML/CSS/JavaScript. No dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, with `PORT` defaulting to `8080`.
`DB_PATH` defaults to `./data/workboard.sqlite`; use the same path on subsequent
starts to preserve projects. Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

Open `http://localhost:8080`. `GET /health` returns `{"status":"ok"}`.
Projects can be created and opened, including through direct project URLs.
Names are trimmed and blank names rejected. Projects appear in creation order.

The integration test starts independent server processes against a temporary
SQLite file and checks validation, ordering, project IDs, routing, health, and
persistence after a process restart.
