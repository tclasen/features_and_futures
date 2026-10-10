# Workboard

Requires Node.js 22.22.1. Uses only built-in Node modules; no installation is needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to
`8080`; `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file
to preserve projects and their IDs across restarts.

Health check:

```sh
curl http://localhost:8080/health
```

Verification:

```sh
npm test
```

The integration test starts real server processes, uses a temporary SQLite
database, and checks validation, ordering, detail navigation, HTML escaping,
and persistence after a restart.
