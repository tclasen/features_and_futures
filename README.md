# Workboard

Requires Node.js 22.22.1. No external dependencies or install step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to retain projects between restarts. `GET /health` returns `{"status":"ok"}`.

Projects are listed in creation order. Names are trimmed and must not be blank; duplicate names are permitted, with distinct persistent IDs.

Run integration tests (using a temporary database):

```sh
npm test
```
