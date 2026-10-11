# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to
the SQLite file to use; the default is `data/workboard.sqlite`. Parent
directories are created automatically. Keep this file across restarts to
preserve project names and IDs.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. Projects are created with trimmed,
nonempty names and displayed in creation order. Project pages use persistent
IDs at `/projects/<id>`. Forms and navigation work without client scripting.
