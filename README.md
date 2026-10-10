# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the same database
path across restarts to preserve projects. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with:

```sh
npm test
```
