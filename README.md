# Workboard

Requires Node.js 22.22.1. No dependencies to install.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. Defaults are port `8080` and database `data/workboard.sqlite`. Visit `/` to create and open projects. Each project supports task creation, completion checkboxes, and combined All/Open/Completed and All/Low/Normal/High priority filtering. Due from and Due through textboxes with Apply due range add inclusive calendar-date boundaries, intersecting both combobox filters. Blank boundaries are unbounded; undated tasks match only when both boundaries are blank. Invalid dates or reversed boundaries show an alert and preserve the applied range. The applied range and both filter selections are retained through edits; matching tasks stay in creation order. Reopening from the project list resets all filters. Filters remain usable while archived and never change completion summaries. Each project has a Default task priority selector with Low, Normal (the initial default), and High options. Saved defaults apply only to subsequently created tasks, persist independently per project, and are disabled while archived. Each task row provides Destination project and Move task. Destinations are other active projects in creation order. Moving appends the task to the destination while preserving its title, completion, priority and due date, and retains the source page's filters. Move controls are disabled on archived projects or when no destinations are available. Each task row also provides Task due date and Save due date. Dates are optional, trimmed Gregorian calendar dates in YYYY-MM-DD format (years 0001–9999); blank input clears the date and invalid input leaves the saved date unchanged. Dates persist independently without affecting filters or other task data, and date controls are disabled while archived. Each task row has a Task priority selector with Low, Normal, and High options. Priorities persist independently and are read-only while archived. Each active task row provides New task title and Rename task; renaming trims the title and preserves ownership, order, completion state, and priority. Active projects can be renamed with New project name and Rename project; renaming preserves their URL, list order, and tasks. Use the Active/Archived project filter to archive or restore projects. Archived projects are read-only; their tasks and completion state are retained. Project rows show completed/total task counts. Projects, tasks, and archive state persist in the configured SQLite file; existing databases are migrated automatically. `GET /health` returns `{"status":"ok"}`.

Run integration checks (including server restart persistence):

```sh
npm test
```
