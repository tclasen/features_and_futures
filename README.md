# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080`. To select a port and persistent database:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080/`. Health is available at `GET /health`.

Run the integration checks with `npm test`.
