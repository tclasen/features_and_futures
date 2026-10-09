# Workboard

Requires Node.js 22.22.1. Uses only Node.js built-in modules; no installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. To configure the port and persistent SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run the integration checks, including persistence across server restarts:

```sh
npm test
```
