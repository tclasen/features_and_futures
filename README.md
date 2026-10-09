# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step are needed.

Run `npm start` to serve on `0.0.0.0:8080`. Set `PORT` to change the port and
`DB_PATH` to choose the persistent SQLite file (default: `data/workboard.sqlite`).
The parent database directory is created on startup. `GET /health` returns
`{"status":"ok"}`. Stop with SIGINT or SIGTERM to close the server and database.

Run `npm test` for integration checks using temporary databases, including
validation, project navigation, and persistence across server restarts.

Each project supports task creation, completion checkboxes, and an All/Open/Completed
filter. Names and titles are trimmed before saving. Tasks belong to one project;
their order and completion state persist in SQLite. Filters are stored in the page
URL and applied after task changes. Completion changes save in place; native form
navigation waits for pending saves so filter changes cannot cancel them. Failed
saves restore the checkbox and show an alert.
