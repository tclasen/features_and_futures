# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are port 8080 and `data/workboard.sqlite`. Retain the configured SQLite file to preserve projects across restarts.

Health check: `curl http://localhost:8080/health`

Run automated HTTP and SQLite restart-persistence checks:

```sh
npm test
```
