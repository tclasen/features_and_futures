# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules with no external dependencies.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Create projects and open them to create tasks, toggle completion, and filter by All, Open, or Completed. The server binds to `0.0.0.0` and defaults to port 8080 and `./data/workboard.sqlite` when environment variables are omitted. Keep the SQLite file to retain projects, tasks, and completion across restarts.

Verify:

```sh
npm test
curl http://localhost:8080/health
```

The integration test checks health, project and task validation and trimming, creation order, project isolation, completion changes, detail routes, and persistence across a server restart using a temporary SQLite file.
