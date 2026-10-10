# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to retain projects, tasks, completion state, and archive state across restarts.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. The project list shows completion summaries and an Active/Archived filter. Archive projects to make their tasks read-only; restore them from the Archived list to resume editing. Active project pages also allow renaming with New project name and Rename project. Renaming preserves the project URL, order, and tasks; archived projects cannot be renamed until restored. Each task row also provides New task title and Rename task controls. Task renaming preserves ownership, order, completion, and summaries, and is disabled while the project is archived. Each task also has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal on migration. Each project's Default task priority selector initially uses Normal and saves independently; new tasks inherit the project's current default. Changing the default leaves existing tasks and both filter selections unchanged. Defaults persist through restarts and renaming, are disabled while archived, and remain available after restoration. Priorities persist independently, survive renaming, and are read-only while archived. A Priority filter (All, Low, Normal, High) combines with Task filter: tasks must match both, retaining creation order. Edits preserve both selections and immediately re-evaluate matching rows. Filters remain usable while archived and never change completion summaries. Opening a project initially selects All on both filters. Each task has a Task due date textbox and Save due date button. Dates are optional, trimmed Gregorian YYYY-MM-DD calendar days (years 0001–9999); blank input clears the date and invalid input leaves saved data unchanged with an alert. Due dates persist independently through renaming and restarts, preserve both filters and other task data, and are read-only while archived. Existing databases migrate automatically with empty due dates.

Due from and Due through apply an inclusive date range alongside both task filters. Blank boundaries are unbounded; any nonblank boundary excludes undated tasks. Apply due range validates calendar dates and ordering without changing the previous applied range on errors. Edits retain the applied range and other filters, and immediately re-evaluate membership. These filters remain usable while archived, do not change saved data or summaries, and reset when reopening from the project list.

Each task row has Destination project and Move task controls. Destinations are other active projects in project creation order. Moves append after the destination's current tasks while preserving task identity, title, completion, priority, and due date. Source filters stay selected and both summaries update. Archived projects cannot send or receive tasks; controls are disabled while archived or when no destinations exist. Task order and ownership persist across restarts, including repeated moves. Existing databases migrate without reordering tasks.

Health: `curl http://localhost:8080/health`

Verification: `npm test`
