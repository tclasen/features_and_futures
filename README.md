# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules, with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is created automatically. Keep the same database path to preserve projects across restarts.

Health check:

```sh
curl http://localhost:8080/health
```

Run the integration checks:

```sh
npm test
```
