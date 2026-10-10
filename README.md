# Workboard

Requires Node.js 22.22.1. No package installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Both environment variables are optional; the values above are the defaults. The configured SQLite file preserves projects, their tasks, and task completion across restarts. Open a project to create tasks, change completion, and filter by All, Open, or Completed.

The project list initially shows Active projects. Each row includes its completed/total task summary and an Archive project button. Select Archived to open or restore archived projects. Archived project pages keep task filtering available and disable task creation and completion changes. Archive state persists, and existing databases are migrated automatically without losing projects or tasks.

Active project pages provide New project name and Rename project controls. Renaming trims whitespace and preserves the project URL, list position, tasks, and completion summary. Blank names show an alert; archived projects disable renaming until restored. Names persist across reloads and restarts.

Each task row provides New task title and Rename task controls. Renaming trims whitespace and preserves the task's project, position, completion and summary counts. Blank titles show an alert. Archived projects disable these controls until restored. Task titles persist across reloads and restarts.

Each task row has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal. Each priority persists independently across reloads and restarts, including task renames and project archive/restoration. Archived projects disable priority edits.

Project pages also provide a Priority filter with All, Low, Normal, and High options. It combines with Task filter to show matching tasks in creation order. Both filters start at All when opening a project, keep their selections during task edits, and remain usable when archived. Editing priority or completion immediately updates the matching rows; summaries always count all tasks.

Each project has a Default task priority selector, initially Normal. Saving Low, Normal, or High applies only to tasks created afterward in that project. Existing tasks and both task filters are unchanged. Defaults persist across reloads, restarts, renaming, archival, and restoration; archived projects display the saved default with the selector disabled.

Every task has a Task due date textbox and Save due date button. Dates are optional: an empty or whitespace-only value clears the date. Nonempty values are trimmed and must be real Gregorian dates in YYYY-MM-DD format, with years 0001–9999. Invalid values show an alert and leave saved data unchanged. Dates persist independently across reloads, restarts, renames, archival, and restoration without changing task filters or summaries. Archived projects disable due-date editing.

Project pages provide Due from and Due through textboxes and Apply due range. Boundaries are inclusive, use the same calendar-date rules as task dates, and may be blank for an unbounded side. A nonempty range excludes undated tasks and combines with both task filters. Invalid dates or reversed boundaries show an alert and keep the previous applied range. Task edits immediately update matching rows without resetting filters; the summary still counts every task. Range controls remain available in archived projects. Reopening a project resets both boundaries to empty.

Each task row provides Destination project and Move task controls. Eligible destinations are other active projects in project creation order. A first arrival appends after all positions established in the destination; a returning task resumes its remembered position there. Positions are saved separately for every project a task has belonged to, including while tasks are away. Existing databases keep their current task order on upgrade. Moves preserve the task's current title, completion, priority, and due date. The source stays open with all filters retained, and both summaries reflect current ownership. Moves and remembered positions persist across restarts. Archived projects cannot send or receive tasks; controls are also disabled when no destination is available.

Project search and Search projects match names by substring and combine with the Active/Archived filter. Task search and Search tasks combine with completion, priority, and the applied due range. Searches ignore ASCII letter case, trim surrounding query whitespace, and preserve internal whitespace. Applied task searches stay selected during edits and moves, including in archived projects. Opening a project or returning through Projects clears the respective search; summaries always count all tasks.

Health check:

```sh
curl http://localhost:8080/health
```

Run the integration tests, including a process restart against the same database:

```sh
npm test
```
