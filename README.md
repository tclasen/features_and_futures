# Workboard

Requires Node.js 22.22.1. No dependencies to install.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. Defaults are port `8080` and database `data/workboard.sqlite`. Visit `/` to create and open projects. Each project supports task creation, completion checkboxes, and combined All/Open/Completed and All/Low/Normal/High priority filtering. Both filter selections are retained through edits; matching tasks stay in creation order. Filters remain usable while archived and never change completion summaries. Each task row has a Task priority selector with Low, Normal (the default), and High options. Priorities persist independently and are read-only while archived. Each active task row provides New task title and Rename task; renaming trims the title and preserves ownership, order, completion state, and priority. Active projects can be renamed with New project name and Rename project; renaming preserves their URL, list order, and tasks. Use the Active/Archived project filter to archive or restore projects. Archived projects are read-only; their tasks and completion state are retained. Project rows show completed/total task counts. Projects, tasks, and archive state persist in the configured SQLite file; existing databases are migrated automatically. `GET /health` returns `{"status":"ok"}`.

Run integration checks (including server restart persistence):

```sh
npm test
```
