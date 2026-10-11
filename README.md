# Workboard

Requires Node.js 22.22.1. No packages need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent SQLite database path with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with:

```sh
npm test
```
