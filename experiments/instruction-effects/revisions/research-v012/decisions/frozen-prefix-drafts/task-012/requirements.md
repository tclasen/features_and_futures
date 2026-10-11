# Task 012: Restore task order when returning to a previous project

Preserve all Tasks 001 through 011 behavior, with this explicit revision to movement order.

- A task moving to a project it has never belonged to appends after that project's existing tasks, as before. A task returning to a project it previously belonged to returns to its previous position relative to that project's other tasks, rather than always appending.
- Preserve each task's ordering position separately for each project it has belonged to. Returning multiple tasks in a different order restores their previous relative order. Newly created tasks and tasks arriving for the first time come after the positions already established in that project.
- Project renaming does not change remembered task positions. Archived projects remain ineligible destinations; restoration makes them eligible again and preserves their remembered positions.
- Current task title, completion, priority and due date survive movement; restoring order does not restore older field values. Source filters, both project summaries, eligible destination choices and all archive restrictions keep their existing behavior.
- Task positions and remembered return behavior persist through reload and server-process restart. Existing tasks keep their current order when this feature is introduced.
- Commit your implementation and report its exact commit ID.
