# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`.
To configure the port and persistent SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The default database is `./data/workboard.sqlite`. Projects retain their names,
creation order, and IDs across server restarts. `GET /health` returns
`{"status":"ok"}`.

Run the integration checks (using an isolated temporary database):

```sh
npm test
```
