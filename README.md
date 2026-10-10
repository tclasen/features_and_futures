# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The database persists projects between restarts.
`GET /health` returns `{"status":"ok"}`.

Run the integration checks with `npm test`.
