# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; `PORT` defaults to
`8080`, and `DB_PATH` defaults to `data/workboard.sqlite`. The SQLite file stores
project names and IDs across restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```
