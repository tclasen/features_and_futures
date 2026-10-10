# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deletion.spec.mjs >> 054 deleted tasks preserve fields intersect filters and remain read-only through project archival
- Location: experiments/instruction-effects/revisions/research-v007/decisions/task-024-final-draft/suite/deletion.spec.mjs:10:2

# Error details

```
Test timeout of 20000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=f30e1]:
  - heading "task-024 Deletion fields" [level=1] [ref=f30e2]
  - group [ref=f30e4]:
    - button "Download project" [ref=f30e5]
  - group [ref=f30e7]:
    - button "Projects" [ref=f30e8]
  - group [ref=f30e10]:
    - generic [ref=f30e11]:
      - text: Task search
      - textbox "Task search" [ref=f30e12]
    - button "Search tasks" [ref=f30e13]
  - group [ref=f30e15]:
    - generic [ref=f30e16]:
      - text: Due from
      - textbox "Due from" [ref=f30e17]
    - generic [ref=f30e18]:
      - text: Due through
      - textbox "Due through" [ref=f30e19]
    - button "Apply due range" [ref=f30e20]
  - group [ref=f30e22]:
    - generic [ref=f30e23]:
      - text: New project name
      - textbox "New project name" [ref=f30e24]
    - button "Rename project" [ref=f30e25]
  - generic [ref=f30e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f30e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f30e30]:
    - generic [ref=f30e31]:
      - text: Task title
      - textbox "Task title" [ref=f30e32]
    - button "Create task" [ref=f30e33]
  - generic [ref=f30e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f30e36]:
      - option "All"
      - option "Open"
      - option "Completed"
      - option "Deleted" [selected]
  - generic [ref=f30e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f30e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f30e40]:
    - text: Completed remove
    - group [ref=f30e42]:
      - button "Restore task" [ref=f30e43]
    - checkbox "Complete Completed remove" [checked] [disabled] [ref=f30e45]
    - group [ref=f30e47]:
      - generic [ref=f30e48]:
        - text: Task notes
        - textbox "Task notes" [disabled] [ref=f30e49]: Deleted Ω note second line
      - button "Save notes" [disabled] [ref=f30e50]
    - group [ref=f30e52]:
      - generic [ref=f30e53]:
        - text: Task due date
        - textbox "Task due date" [disabled] [ref=f30e54]: 2036-02-29
      - button "Save due date" [disabled] [ref=f30e55]
    - group [ref=f30e57]:
      - generic [ref=f30e58]:
        - text: Destination project
        - combobox "Destination project" [disabled] [ref=f30e59]:
          - option "task-012 Position first owner" [disabled] [selected]
          - option "task-012 Position second owner" [disabled]
          - option "task-018 Import restart" [disabled]
          - option "task-012 Search Mixed first" [disabled]
          - option "task-012 Search mixed last" [disabled]
          - option "task-012 Search double gap" [disabled]
          - option "task-012 Whitespace Saved first" [disabled]
          - option "task-024 Bulk first owner" [disabled]
          - option "task-024 Bulk second owner" [disabled]
          - option "task-024 Bulk protected" [disabled]
          - option "task-024 Bulk restart first" [disabled]
          - option "task-024 Bulk restart second" [disabled]
          - option "task-024 Defaults independent" [disabled]
          - option "task-024 Defaults inheritance" [disabled]
          - option "task-024 Defaults renamed" [disabled]
      - button "Move task" [disabled] [ref=f30e60]
    - group [ref=f30e62]:
      - generic [ref=f30e63]:
        - text: New task title
        - textbox "New task title" [disabled] [ref=f30e64]
      - button "Rename task" [disabled] [ref=f30e65]
    - generic [ref=f30e67]:
      - text: Task priority
      - combobox "Task priority" [disabled] [ref=f30e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
```