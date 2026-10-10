# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Start the application:

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). `DB_PATH` selects the persistent SQLite file (default `data/workboard.sqlite`); its parent directory is created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project names are trimmed, required, and escaped when rendered. Projects are listed by their persistent creation IDs. Form submissions redirect after successful creation so refreshing the list does not create another project.

Run syntax checks and integration tests:

```sh
npm run check
npm test
```

The integration test starts real server processes on ephemeral ports and verifies persistence using a temporary database that is removed afterward.
