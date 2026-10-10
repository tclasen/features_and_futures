# Workboard

A project list built with Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS. No external dependencies or installation step are needed.

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

The integration test starts the actual server with a temporary database, checks project validation, ordering and navigation, and restarts the process to verify persistence. Its temporary files are removed after the test.
