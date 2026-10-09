# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is stored at `DB_PATH` (default `data/workboard.sqlite`); keep this file to preserve projects, tasks, and completion state across restarts.

Example with explicit configuration:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project page supports task creation, completion checkboxes, and All/Open/Completed filters. Filters default to All and can be preserved in the page URL. `GET /health` returns `{"status":"ok"}`.

Run the automated HTTP integration tests (including restart persistence):

```sh
npm test
```
