# Workboard

A project list and project detail application using Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No dependencies or installation are required.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port `8080` and database `data/workboard.sqlite`. Keep the database file to preserve projects across restarts.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration test uses a temporary database and verifies validation, ordering, detail routes, health, and persistence across server-process restarts.
