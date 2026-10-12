# Workboard

Requires Node.js 22.22.1. No package installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0` and exposes
`GET /health`. `PORT` defaults to `8080`; `DB_PATH` defaults to
`./data/workboard.sqlite`. Keep the database file to retain projects across
restarts.

Run the integration checks:

```sh
npm test
```

Tests use a temporary database outside the repository and remove it afterward.
