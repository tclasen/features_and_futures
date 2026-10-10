# Workboard

Requires Node.js 22.22.1. No dependencies to install.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `./data/workboard.sqlite`. The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.

Projects are stored in SQLite and displayed in creation order. Native HTML forms provide accessible creation and navigation without requiring browser JavaScript.

Run the integration checks (including process-restart persistence):

```sh
npm test
```

Tests use temporary databases outside the repository and remove them afterward.
