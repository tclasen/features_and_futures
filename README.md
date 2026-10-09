# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external application dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the SQLite file to preserve projects across restarts.

Run the integration checks:

```sh
npm test
```

Health check:

```sh
curl http://localhost:8080/health
```
