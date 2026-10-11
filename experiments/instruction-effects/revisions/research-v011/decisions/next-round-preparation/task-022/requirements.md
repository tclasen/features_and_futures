## Requirement022: show completion totals for the current directory result

Dependencies: all requirements through021 remain cumulative. Add one read-only summary with data-testid `directory-summary` to Task directory. Its text is exactly `{K}/{N} completed`, where N is the number of tasks matching the current directory project scope, task filter, priority filter, applied due range and title search, and K is the number of those matching tasks whose stored completion is true. Each matching task counts once. Changing Directory order never changes either count.

The summary follows the current resolved directory result on every filter, search, due-range or bulk-action update. Active and Archived scopes use the same calculation; Deleted counts the matching deleted records and their retained completion flags. A resolved empty result displays `0/0 completed` together with the existing `No matching tasks` announcement. Do not announce an empty result just because an update is still loading.

Counts do not mutate any task or project, include unrelated tasks, or change stored order, ownership, remembered positions or completion flags. Project summaries continue to count their own live tasks according to the earlier requirements. All directory controls, literal record fields, ordering, protected scopes and persistence requirements remain cumulative.
