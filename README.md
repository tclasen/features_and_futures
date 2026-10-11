# Workboard

Requires Node.js 22.22.1. No dependencies need installation.

Start with `npm start`. The server binds to `0.0.0.0` on `PORT` (default `8080`).
Set `DB_PATH` to select a persistent SQLite file (default `data/workboard.sqlite`).

Example: `PORT=8080 DB_PATH=data/workboard.sqlite npm start`

Run verification with `npm test`.
