# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step are needed.

Run `npm start` to serve on `0.0.0.0:8080`. Set `PORT` to change the port and
`DB_PATH` to choose the persistent SQLite file (default: `data/workboard.sqlite`).
The parent database directory is created on startup. `GET /health` returns
`{"status":"ok"}`. Stop with SIGINT or SIGTERM to close the server and database.

Run `npm test` for integration checks using temporary databases, including
validation, project navigation, and persistence across server restarts.
