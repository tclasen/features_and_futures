## Requirement021: order the task directory without changing stored order

Dependencies: requirements through020 remain cumulative. Add a `Directory order` combobox with the options `Original`, `Priority`, `Due date`, and `Title`. Every new opening of Task directory starts at Original. Original uses the existing owner creation order and each owner’s stored task order.

Priority places High before Normal before Low. Due date places dated tasks in ascending calendar order, followed by undated tasks. Title compares the literal stored title after converting ASCII A–Z to a–z, in ascending character order; internal whitespace remains significant. For equal priority, equal due date, or equal folded title, keep the relative order from Original. Ordering applies across the entire directory result, including Archived and Deleted views.

Changing Directory order retains the current project scope, task filter, priority filter, applied due range and title search. Later filter, search, due-range and bulk completion actions retain the selected Directory order and render their results in that order. Opening a project from a directory row continues to reset that project’s view filters as already specified.

Ordering is a view operation. It never changes a task’s fields, ownership, stored order or remembered positions, and never changes a project’s fields or creation order. Project task views, export snapshots and later moves continue to use the original stored order. All earlier persistence, archive, deletion and bulk-action requirements remain cumulative.
