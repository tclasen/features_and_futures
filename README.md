# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. To configure the port and persistent SQLite database:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run the integration checks (including persistence after a server restart):

```sh
npm test
```
