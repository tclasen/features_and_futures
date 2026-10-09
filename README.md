# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; set `PORT` to choose another port and `DB_PATH` to choose the persistent SQLite file (default `data/workboard.sqlite`). For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Run the integration checks with `npm test`. They use a temporary SQLite database and verify project validation, creation order, escaping, navigation, health, and persistence across a server restart.
