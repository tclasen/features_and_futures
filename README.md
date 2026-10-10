# Workboard

A project workspace using Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS. No external dependencies or install step are needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the SQLite file to preserve projects between server restarts. `GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

The integration test uses a temporary database and checks the health endpoint, form labels, blank-name validation, trimming, creation order, HTML escaping, project navigation, and persistence across process restarts.
