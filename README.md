# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules with no external dependencies.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0` and defaults to port 8080 and `./data/workboard.sqlite` when environment variables are omitted. Keep the SQLite file to retain projects across restarts.

Verify:

```sh
npm test
curl http://localhost:8080/health
```

The integration test checks health, name validation and trimming, project order, detail routes, and persistence across a server restart using a temporary SQLite file.
