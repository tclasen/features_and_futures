# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `GET /health`
returns `{"status":"ok"}`. If omitted, `PORT` defaults to `8080` and
`DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file to
preserve projects between restarts.

```sh
npm test
```

The integration test uses an isolated database and verifies validation,
creation order, navigation markup, HTML escaping, health, and persistence
across server restarts.
