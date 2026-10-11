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
