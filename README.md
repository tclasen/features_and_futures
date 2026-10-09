# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). `DB_PATH`
selects the persistent SQLite file (default `data/workboard.sqlite`); its parent
folder is created automatically. Keep that file when restarting the server.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Forms work without client-side scripting.
`GET /health` returns `{"status":"ok"}`.

Run automated HTTP, validation, escaping, and restart-persistence checks:

```sh
npm test
```

Tests use temporary databases outside the repository and remove them afterward.
