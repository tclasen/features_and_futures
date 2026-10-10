# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`.
Set `PORT` to change the port and `DB_PATH` to select the persistent SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`GET /health` returns `{"status":"ok"}`. Run the integration checks with `npm test`.
