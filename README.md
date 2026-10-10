# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Set `PORT` to choose a port
and `DB_PATH` to choose the persistent SQLite file (default `data/workboard.sqlite`).

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Run the integration checks with `npm test`.
