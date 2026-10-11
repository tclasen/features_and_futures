# Workboard

A dependency-free project directory using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered HTML/CSS. Forms work without client-side JavaScript.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Preserve that file to retain project names and IDs across restarts. Parent directories are created automatically.

`GET /health` returns HTTP 200 with `{"status":"ok"}`.

## Verify

```sh
npm test
node --check server.js
```

Tests use temporary databases and ephemeral ports, exercising validation, creation order, HTML escaping, navigation, missing projects, and persistence across process restarts.
