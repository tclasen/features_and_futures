# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to retain projects, tasks, completion state, and archive state across restarts.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. The project list shows completion summaries and an Active/Archived filter. Archive projects to make their tasks read-only; restore them from the Archived list to resume editing. Active project pages also allow renaming with New project name and Rename project. Renaming preserves the project URL, order, and tasks; archived projects cannot be renamed until restored. Each task row also provides New task title and Rename task controls. Task renaming preserves ownership, order, completion, and summaries, and is disabled while the project is archived. Each task also has a Task priority selector with Low, Normal, and High options. Existing and new tasks default to Normal. Priorities persist independently, survive renaming, and are read-only while archived. A Priority filter (All, Low, Normal, High) combines with Task filter: tasks must match both, retaining creation order. Edits preserve both selections and immediately re-evaluate matching rows. Filters remain usable while archived and never change completion summaries. Opening a project initially selects All on both filters. Existing databases migrate automatically.

Health: `curl http://localhost:8080/health`

Verification: `npm test`
