# Workboard

Requires Node.js 22.22.1. No application dependencies are needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Set `PORT` and `DB_PATH` to configure the port and persistent SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with `npm test`.
