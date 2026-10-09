# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The default port is 8080 and the default database
is `./data/workboard.sqlite`. The server binds to `0.0.0.0` and creates the
database's parent directory if needed. Keep the SQLite file to retain projects
across restarts. `GET /health` returns `{"status":"ok"}`.

Run integration tests (including actual server-process restart persistence):

```sh
npm test
```

Project names are trimmed and must be nonempty. Projects are listed in insertion
order; their integer IDs are stable. Browser project pages are at `/projects/<id>`.
