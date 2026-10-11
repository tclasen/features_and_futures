# Workboard

A projects application using Node.js 22.22.1, ES modules, built-in HTTP and SQLite, and browser HTML/CSS. No package installation or external dependencies are needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. Keep that database file to preserve projects across restarts. Its parent directory is created automatically. `GET /health` returns `{"status":"ok"}`.

Open `http://localhost:8080` to create and open projects. Names are trimmed before saving; empty names display a validation alert. Projects appear in creation order. Forms use standard browser navigation and work without client-side scripting.

Verification:

```sh
npm test
node --check server.js
node --check test/projects.test.js
```

The integration test starts servers with a temporary SQLite database, checks validation, escaping, ordering and navigation, then restarts the server to verify stored names and IDs.
