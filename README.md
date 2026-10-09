# Workboard

Requires Node.js 22.22.1. No dependencies to install.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The default port is 8080 and the default database is
`data/workboard.sqlite`. Keep the database file to preserve projects, tasks,
completion states, and archives across restarts. Existing project databases are
automatically migrated with all projects initially active.

Use the Project filter to view Active or Archived projects. Archive and restore
projects from their list rows. Archived project pages retain task filtering but
disable task creation and completion changes. Each project row summarizes all
of its tasks as completed/total completed.

```sh
npm test
```

The integration test uses a temporary database and checks project creation,
validation, ordering, navigation, task creation, completion toggling, filtering,
project isolation, archive/restore, completion summaries, database migration,
and persistence across server restarts. Archived task mutations are also rejected
by the server.
The completion regression test also executes the page script against the HTTP
server to verify that filter navigation waits for saves and failed saves restore
the previous checkbox state.
