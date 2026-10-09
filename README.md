# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to preserve projects across restarts. Health: `GET /health`.

Verify:

```sh
npm test
node --check public/app.js
```

The integration test checks validation, creation order, routes, health, and database persistence across server restarts using an isolated temporary database.
