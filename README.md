# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the configured SQLite file to preserve projects, tasks, and completion state across restarts. Its parent directory is created automatically.

`GET /health` returns HTTP 200 with `{"status":"ok"}`.

The application uses server-rendered HTML and native forms. SQLite assigns an internal creation sequence for stable project and task ordering; public IDs are UUIDs. Project names and task titles are trimmed before insertion and escaped when rendered. Each project page supports task creation, saved completion checkboxes, and All, Open, and Completed filters. Small browser event handlers submit completion and filter changes automatically.

## Verify

```sh
npm test
```

The tests launch real HTTP servers with temporary SQLite files and check validation, creation order, navigation, HTML escaping, health, project isolation, task filtering, completion updates, and persistence across process restarts.
