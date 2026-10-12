# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH`
defaults to `./data/workboard.sqlite`. Parent database directories are created
automatically. Keep the database file to preserve project names and IDs across
restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration tests with `npm test`. Tests use temporary databases outside
the repository and clean up their server processes and files.
