# Workboard

Requires Node.js 22.22.1. No dependencies to install.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The default port is 8080 and the default database is
`data/workboard.sqlite`. Keep the database file to preserve projects, tasks, and completion states across restarts.

```sh
npm test
```

The integration test uses a temporary database and checks project creation,
validation, ordering, navigation, task creation, completion toggling, filtering,
project isolation, and persistence across server restarts.
The completion regression test also executes the page script against the HTTP
server to verify that filter navigation waits for saves and failed saves restore
the previous checkbox state.
