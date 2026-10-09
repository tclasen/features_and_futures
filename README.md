# Workboard

A projects and tasks app using Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No dependency installation is needed.

Run:

```sh
npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`GET /health` returns `{"status":"ok"}`. Project names are trimmed, validated, and displayed in creation order. Use each project's **Open project** button to view it and **Projects** to return.

Within a project, enter a **Task title** and select **Create task**. Titles are trimmed and required. Use a task's checkbox to save its completion state and **Task filter** to show **All**, **Open**, or **Completed** tasks in creation order. Tasks belong to their project; projects, tasks, and completion states persist in the configured SQLite file across restarts.

The **Project filter** starts at **Active**. Select **Archive project** to move a project to **Archived**, where **Restore project** returns it to Active. Archived projects can still be opened and their tasks filtered, but task creation and completion changes are disabled. Each project row shows the completed count out of all its tasks. Archive state and tasks persist across restarts; existing databases are migrated automatically.

On an active project page, enter a **New project name** and select **Rename project**. Names are trimmed and required. Renaming preserves the project's URL, creation order, tasks, completion state, and summary. Archived projects cannot be renamed until restored. Renamed projects persist across reloads and restarts.

Run the integration checks with:

```sh
npm test
```
