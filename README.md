# Workboard

Requires Node.js 22.22.1. No dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `data/workboard.sqlite`. The server binds to `0.0.0.0`. Keep the SQLite file to preserve projects across restarts.

Health check: `curl http://localhost:8080/health`

Run integration tests (using a temporary database):

```sh
npm test
```
