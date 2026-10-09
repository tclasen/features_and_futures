# Workboard

A projects workspace built with Node.js 22.22.1, its built-in HTTP and SQLite modules, and browser HTML, CSS, and JavaScript. There are no external dependencies.

Run with:

```sh
npm start
```

The server binds to `0.0.0.0` at `PORT` (default `8080`). It stores projects in `DB_PATH` (default `./data/workboard.sqlite`) and creates the database's parent directory when needed.

To choose the port and persistent database:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run the integration tests with:

```sh
npm test
```

Tests use an isolated temporary SQLite database and verify validation, creation order, project IDs, routes, and persistence after a server restart.
