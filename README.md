# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

Run `npm start` to listen on `0.0.0.0:8080`. Set `PORT` to change the port and
`DB_PATH` to select the persistent SQLite file (default: `./data/workboard.sqlite`).
The database directory is created automatically. Retain this file across restarts.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.
On a project page, create tasks, toggle completion, and filter by All, Open, or
Completed. Tasks belong to their project and retain their saved state on restart.
Priority filter offers All, Low, Normal, and High, and combines with Task filter.
Both filters start at All when opening a project and remain selected during task
edits. Completion and priority changes immediately update matching rows; filtering
preserves creation order and leaves saved data and completion summaries unchanged.
Both filters remain available in archived projects.
The project list defaults to Active; switch Project filter to Archived to open or
restore archived projects. Archiving preserves tasks and makes task creation and
completion read-only until restoration. Each row summarizes all completed tasks.
Existing databases are migrated automatically without changing project or task IDs.
Active project pages also support renaming. Names are trimmed; renaming preserves
the project URL, list order, tasks, and summary. Archived projects cannot be renamed
until restored.
Each task row supports renaming with a trimmed title. Renaming preserves task
ownership, order, completion, and summaries, and updates its completion label.
Archived projects disable task renaming until restored.
Each task has a saved priority: Low, Normal, or High. Each project's Default task
priority starts at Normal and is saved independently. New tasks inherit that saved
default; changing it leaves existing tasks and both selected filters unchanged.
Archived projects display their saved default but disable changes until restored.
Priority changes preserve task order, completion, ownership, and summaries;
renaming preserves priority. Archived projects disable priority edits until restored.
Each task supports an optional Task due date. Save a real Gregorian date in
YYYY-MM-DD format (years 0001–9999), or save a blank value to clear it. Dates are
calendar days without timezone conversion. Invalid dates leave saved data intact.
Due dates persist independently through renaming and restarts; archived projects
disable due-date editing until restored.
Due from and Due through apply an inclusive date range that intersects the task
completion and priority filters. Blank boundaries are unbounded; any nonblank
boundary excludes undated tasks. Apply due range validates both dates and their
order before replacing the applied range. Invalid applications keep the previous
visible membership. Edits re-evaluate the applied range without resetting filters.
Range controls remain usable in archived projects and reset to empty on reopening.
Each task row offers Destination project and Move task. Destinations are other
active projects in project creation order. A first-time arrival appends after all
positions established in its destination.
Returning tasks recover their remembered position relative to other tasks, even
when several tasks return in a different order. Positions remain reserved while
tasks are away and survive restarts, project renaming, archival, and restoration.
Existing databases retain their current order during migration. Moving preserves
the task's identity, title, completion, priority, and due date. The source
page stays open with its selected filters and applied due range. Both project
summaries reflect their current tasks. Archived projects cannot send or receive
tasks; moving controls are disabled when archived or no destinations are available.
Run `npm test` for date-validation and HTTP integration tests, including persistence across separate
server processes. Tests use temporary databases and clean them up afterward.
