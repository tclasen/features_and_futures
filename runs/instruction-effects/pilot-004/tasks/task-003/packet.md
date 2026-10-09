Work only in your assigned repository on the current task. Implement the supplied requirements using the specified technology stack. Preserve the previously required behavior. Use the shared launch and health interfaces. Manage your own Git history and submit an exact commit plus the required run commands. Work within the supplied tool and resource limits. If verification fails, use the factual feedback to revise your submission. Do not access PM files, other builders, or their artifacts. Do not work ahead on undispatched tasks.

# Workboard pilot workload

A browser application for creating projects, managing tasks within them, and archiving completed projects. The pilot has three cumulative tasks: projects; task creation/completion/filtering; archive/restore and completion summaries.

Every builder uses Node.js 22.22.1, JavaScript ES modules, built-in HTTP (node:http) and SQLite (node:sqlite), and browser HTML/CSS/JavaScript. No external application dependencies are required or permitted in this pilot. This keeps package installation and network access outside the measured feature work.

The shared start command is `npm start`. The server entry point is `server.js`; internal module layout is independent. Bind to `0.0.0.0` at `PORT` (default 8080). Use the SQLite file at `DB_PATH`, preserving data across process restarts. Serve `GET /health` as JSON `{"status":"ok"}`.

Requirements specify accessible UI labels and observable row boundaries for a common acceptance surface. The PM's Playwright source remains outside builder sandboxes. Application code and tests are independently owned by each builder.

The pilot verifies measurement and orchestration, not an instruction effect. A main run may grow this workload through additions and revisions after its evidence method has been frozen.


Cumulative requirements through this task:

# Task 001: Projects

Build the initial Workboard application using the specified stack and shared launch contract.

- At `/`, show the heading `Workboard`, a textbox labelled `Project name`, and a button `Create project`.
- Creating a project trims its name. A blank or whitespace-only name leaves the list unchanged and displays a visible alert containing `Project name is required`.
- Display projects in creation order. Each project has a visible row with `data-testid="project-row"`, its name, and a button `Open project`.
- Opening a project navigates to `/projects/<project-id>`, shows its name as a heading, and provides a `Projects` button to return to the list.
- Project names and IDs persist across page reloads and server-process restarts using the configured SQLite file.
- `GET /health` returns HTTP 200 and JSON `{"status":"ok"}`.
- Start with `npm start`, binding to `0.0.0.0` at `PORT` (default 8080), and store data at `DB_PATH`. No external application dependencies are permitted.
- Commit your implementation in your independent Git repository. Leave relevant source changes committed and report the submitted commit ID. Do not modify the assigned technology stack or work ahead on undispatched features.

# Task 002: Tasks within projects

Preserve all Task 001 behavior.

- On each project page, provide a textbox `Task title` and button `Create task`.
- Task creation trims its title. Blank or whitespace-only input leaves tasks unchanged and displays an alert containing `Task title is required`.
- Show each task in a row with `data-testid="task-row"`, its title, and a checkbox whose accessible name is `Complete <task-title>`.
- New tasks are open. Checking or unchecking completion updates the saved state.
- A combobox labelled `Task filter` has visible options `All`, `Open`, and `Completed`. Initially select `All`; display the matching tasks in creation order.
- Tasks are owned by their project: other project pages never show them.
- Project-page URLs remain usable after reload. Tasks and completion state persist across reloads and server-process restarts.
- Commit your implementation and report its exact commit ID.

# Task 003: Archive/restore and completion summaries

Preserve all Tasks 001 and 002 behavior.

- The project list has a combobox labelled `Project filter` with options `Active` and `Archived`, initially `Active`.
- Each active project row has an `Archive project` button. Archiving removes it from the Active list and adds it to the Archived list.
- Archived rows still have `Open project` and additionally `Restore project`. Restoration returns the project to Active without losing its tasks or completion state.
- An archived project page shows visible text `Archived project`, disables `Create task`, and disables all task completion checkboxes. Tasks remain visible and filtering works.
- Each project row includes `data-testid="project-summary"` with text `<completed-count>/<total-count> completed`. New projects show `0/0 completed`; the counts include all tasks regardless of the current task filter.
- Archive state, restored tasks, and completion counts persist across page reloads and process restarts.
- Commit your implementation and report its exact commit ID.
