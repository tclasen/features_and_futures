# Workboard

Projects application using Node.js 22.22.1, native HTTP, SQLite, and browser HTML/CSS. No external dependencies or installation required.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `data/workboard.sqlite`. The server binds to `0.0.0.0`; `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests exercise validation, creation order, escaped names, detail routes, health, and persistence across a server restart using a temporary database under `data/`.
