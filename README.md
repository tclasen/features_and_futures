# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `data/workboard.sqlite`) and persists across restarts.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
```

Open `http://localhost:8080/` to create and open projects.
`GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```
