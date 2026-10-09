# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

Start the application:

```sh
npm start
```

It binds to `0.0.0.0:8080` and stores projects in `data/workboard.sqlite` by default.
To configure the port and persistent database location:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080/` to create and open projects. `GET /health` returns
`{"status":"ok"}`.

Run the integration checks (including a process restart):

```sh
npm test
```
