# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. To configure the port and durable SQLite database:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `http://localhost:8080`. `GET /health` returns `{"status":"ok"}`.

Run the automated HTTP and persistence checks with:

```sh
npm test
```
