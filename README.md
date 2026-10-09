# Workboard

Requires Node.js 22.22.1. No external dependencies or installation required.

```sh
npm start
```

The server listens on `0.0.0.0`, using `PORT` (default `8080`). SQLite data is stored at `DB_PATH` (default `data/workboard.sqlite`); parent directories are created automatically. Keep this file across restarts.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run automated HTTP and persistence checks:

```sh
npm test
```
