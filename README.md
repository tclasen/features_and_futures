# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP, and SQLite.

## Run

```sh
npm start
```

The server binds to `0.0.0.0`, with `PORT` defaulting to `8080` and `DB_PATH` defaulting to `data/workboard.sqlite`. Parent database directories are created automatically. Set `DB_PATH` to a persistent, writable file location to retain projects across restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Pages use native HTML forms and work without client-side scripting. SQLite assigns permanent project IDs; the list is sorted by creation ID. Names are trimmed on the server and escaped when rendered.

## Verify

```sh
npm test
node --check server.js
```

Tests launch the real server against a temporary database and cover health, required-name validation, trimming, creation order, HTML escaping, project navigation, and persistence across server restarts. Temporary files are removed after the test.
