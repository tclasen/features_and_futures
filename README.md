# Workboard

Projects application using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered HTML/CSS. No dependencies or install step are needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file to retain projects across restarts.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use a temporary database and check required labels, validation, trimming, ordering, safe name rendering, navigation, health, and persistence across a server restart.
