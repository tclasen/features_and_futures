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
