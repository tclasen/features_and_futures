# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Start the application:

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). `DB_PATH` selects the persistent SQLite file (default `data/workboard.sqlite`); its parent directory is created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project names are trimmed, required, and escaped when rendered. Projects are listed by their persistent creation IDs. Form submissions redirect after successful creation so refreshing the list does not create another project.

Project pages support task creation, completion checkboxes, and All/Open/Completed filters. Task titles are trimmed and required. Tasks belong to their project, and completion persists in SQLite. Filter selections are stored in the page URL; task submissions preserve both current filters. The browser submits completion and filter changes automatically.

The project list starts with Active projects and supports an Archived filter. Archive and restore preserve project IDs, tasks, and completion state. Archived project pages allow task filtering but disable creation and completion changes; the server also rejects these mutations. Each project row shows completed/total counts across all its tasks. Existing databases are migrated automatically, with existing projects remaining active.

Active project pages support renaming with a trimmed, required name. Renaming preserves the project's URL, creation order, tasks, and completion counts. Archived projects disable rename controls and reject rename requests; restoring a project enables renaming again. Names persist across reloads and server restarts.

Each task row supports renaming with a trimmed, required title. Renaming preserves ownership, creation order, completion state, filter membership, and project summaries, while updating the completion checkbox label. Archived projects disable task rename controls and reject rename requests. Restoring a project enables task renaming again. Task titles persist across reloads and process restarts.

Each task row has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal when migrated; new tasks inherit their project's saved default. Priority changes persist independently without changing task titles, completion, ownership, order, filters, or project summaries. Renaming preserves priority. Archived projects disable priority selectors and reject priority changes; restoration enables them with their saved values. Invalid priority values are rejected without modifying data.

Each project page also has a Priority filter with All, Low, Normal, and High options. Both task filters start at All when opening a project from the list. Tasks must match both selected filters and retain creation order. Changing either filter preserves the other selection. Completion and priority edits immediately re-evaluate the rows after submission; renaming retains filter selections. Filters remain enabled in archived projects. Filtering never changes saved tasks or project summaries.

Each project page has a Default task priority selector with Low, Normal, and High options, initially Normal. Changes affect only subsequent task creation in that project and preserve existing tasks, both selected filters, and completion summaries. Defaults persist independently across reloads, restarts, project renaming, archive, and restore. Archived projects display a disabled selector and reject default changes on the server. Existing databases are migrated without changing task priorities or project identity.

Run syntax checks and integration tests:

```sh
npm run check
npm test
```

The integration tests start real server processes on ephemeral ports and verify validation, creation order, escaping, task filtering, project isolation, completion updates, archive/restore, renaming without identity changes, independent task priorities, all combined priority/completion filters, filter retention during edits, completion summaries, archived mutation rejection, database migration, and restart persistence using temporary databases that are removed afterward.
