# Workboard

Requires Node.js 22.22.1. No external dependencies or install step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to retain projects and tasks between restarts. `GET /health` returns `{"status":"ok"}`.

Projects are listed in creation order. Names are trimmed and must not be blank; duplicate names are permitted, with distinct persistent IDs.

Each project has its own tasks, listed in creation order. Titles are trimmed and required. Completion can be checked or unchecked and is saved immediately. The Task filter offers All (the default), Open, and Completed; changing the filter does not alter saved tasks.

Run integration tests (using a temporary database):

```sh
npm test
```
