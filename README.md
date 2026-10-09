# Workboard

Requires Node.js 22.22.1. No dependencies or install step are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `data/workboard.sqlite`. Parent directories are created automatically. Keep the SQLite file to preserve projects across restarts.

`GET /health` returns `{"status":"ok"}`. Projects are stored in creation order with stable numeric IDs. The browser uses `/api/projects` (GET and POST) and `/api/projects/:id` (GET).

Run automated HTTP, validation, route, and restart-persistence checks:

```sh
npm test
```
