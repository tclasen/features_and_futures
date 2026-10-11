# Workboard

Requires Node.js 22.22.1. No dependencies need installation.

Start with `npm start`. The server binds to `0.0.0.0` on `PORT` (default `8080`).
Set `DB_PATH` to select a persistent SQLite file (default `data/workboard.sqlite`).

Example: `PORT=8080 DB_PATH=data/workboard.sqlite npm start`

Run verification with `npm test`.

Create projects on the home page and open a project to create tasks. Task titles
are trimmed, tasks start open, and the Task filter shows All, Open, or Completed
tasks in creation order. Completion changes and project ownership are stored in
the configured SQLite file and survive restarts.
