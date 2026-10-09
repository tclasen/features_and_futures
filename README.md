# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite; no dependency installation is needed.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080`, and `DB_PATH` defaults to `./data/workboard.sqlite`. Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
node --check server.js
node --check public/app.js
```

The integration test launches via `npm start` with a temporary database, checks validation and project ordering, then restarts the process to check that names and IDs persist. Browser interaction is not covered by this test.
