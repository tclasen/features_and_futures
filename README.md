# Workboard

A project and task board built with Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No external dependencies or installation step are needed.

Run:

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to choose the persistent SQLite file (default `data/workboard.sqlite`):

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080/`. `GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

The integration tests start the actual server with temporary databases, check project and task validation, ordering, navigation, completion, filtering, project isolation, archive/restore, read-only archived tasks, completion summaries, project and task renaming, and independent task priorities. They also verify migration from the earlier schema and restart the process to check persistence. Temporary files are removed after the tests.
