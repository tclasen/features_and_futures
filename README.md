# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`; `GET /health` returns `{"status":"ok"}`.
Projects are stored in SQLite and survive restarts when using the same `DB_PATH`.

Run the integration checks (using a temporary database):

```sh
npm test
```
