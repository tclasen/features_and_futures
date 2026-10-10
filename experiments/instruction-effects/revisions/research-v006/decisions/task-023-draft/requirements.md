## Requirement023: show per-project totals for the directory result

Dependencies: all requirements through022 remain cumulative. Add a separate list of owning projects represented in the current directory result. Each represented project has exactly one visible row with data-testid `directory-owner-row`, its literal current name in `directory-owner-name`, its matching-task summary in `directory-owner-summary`, and an `Open project` button. The summary text is `{K}/{N} completed` using only that project's tasks matching all current directory controls. Include only projects with at least one matching task.

The owner list uses project creation order even when Directory order globally sorts the task rows by priority, date or title. Update it with every resolved filter, search, due-range and bulk-action result. A resolved empty result has no owner rows and retains the global `0/0 completed` summary and `No matching tasks` announcement. The sums of owner counts agree with the global directory totals.

Projects have independent identities. Creating or renaming a project to a name already used by another project is allowed; do not merge their tasks or summaries, collapse their owner rows, alter their IDs or reorder the projects. Earlier blank-name validation and trimming continue to apply. The owner-row button opens that row's project and resets its view filters exactly as already required, including read-only behavior for archived projects.

The owner list is a view of the current result. It never changes stored completion, fields, ownership, task order, remembered positions, project fields or the older live-task project summaries. All global directory ordering, protected scopes and persistence requirements remain cumulative.
