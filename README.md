# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure its port and persistent SQLite file with environment variables:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with:

```sh
npm test
```
