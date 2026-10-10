# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step are needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with `npm test`. Tests use an isolated temporary database and verify validation, creation order, escaping, navigation, and persistence after a server restart.
