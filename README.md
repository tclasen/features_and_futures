# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite, with no external dependencies.

Start:

```sh
npm start
```

The server binds to `0.0.0.0` on port `8080` by default. Configure the port and persistent database file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project supports task creation, completion checkboxes, and All/Open/Completed filters. Projects and tasks persist in the configured SQLite file. `GET /health` returns `{"status":"ok"}`.

Run verification:

```sh
npm test
```

The test uses a temporary SQLite file and verifies project and task validation, creation order, HTML escaping, navigation, project isolation, completion updates, filtering, and persistence across a server restart.
