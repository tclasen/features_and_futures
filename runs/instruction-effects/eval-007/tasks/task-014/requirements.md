# Task 014: Ignore runs of spaces and tabs when searching

Preserve all Tasks 001 through 013 behavior, with this explicit revision to search matching.

- For project and task substring matching only, replace each run of ASCII spaces and horizontal tabs in both the query and stored name/title with one space. Continue trimming surrounding query whitespace and ignoring ASCII letter case. This supersedes Task013's rule that internal whitespace is significant.
- Search normalization must not rewrite stored project names, task titles or other saved data. Display the original saved names/titles, including their internal spaces and case, after searching, clearing search, reloading and restarting.
- Preserve all existing project/task filter intersection, matching order, empty-query defaults, archived readability, immediate re-evaluation and movement/return-position behavior. All other editing and persistence rules remain unchanged.
- Commit your implementation and report its exact commit ID.
