# Workboard

Requires Node.js 22.22.1. No dependencies to install.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. Defaults are port `8080` and database `data/workboard.sqlite`. Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Run integration checks (including server restart persistence):

```sh
npm test
```
