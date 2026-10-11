# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deletion.spec.mjs >> 054 deleted tasks preserve fields intersect filters and remain read-only through project archival
- Location: experiments/instruction-effects/revisions/research-v011/preflight/task020-executed-suite/deletion.spec.mjs:10:2

# Error details

```
Test timeout of 20000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=f31e1]:
  - heading "task-020 Deletion fields" [level=1] [ref=f31e2]
  - group [ref=f31e4]:
    - button "Download project" [ref=f31e5]
  - group [ref=f31e7]:
    - button "Projects" [ref=f31e8]
  - group [ref=f31e10]:
    - generic [ref=f31e11]:
      - text: Task search
      - textbox "Task search" [ref=f31e12]
    - button "Search tasks" [ref=f31e13]
  - group [ref=f31e15]:
    - generic [ref=f31e16]:
      - text: Due from
      - textbox "Due from" [ref=f31e17]
    - generic [ref=f31e18]:
      - text: Due through
      - textbox "Due through" [ref=f31e19]
    - button "Apply due range" [ref=f31e20]
  - group [ref=f31e22]:
    - generic [ref=f31e23]:
      - text: New project name
      - textbox "New project name" [ref=f31e24]
    - button "Rename project" [ref=f31e25]
  - generic [ref=f31e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f31e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f31e30]:
    - generic [ref=f31e31]:
      - text: Task title
      - textbox "Task title" [ref=f31e32]
    - button "Create task" [ref=f31e33]
  - generic [ref=f31e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f31e36]:
      - option "All"
      - option "Open"
      - option "Completed"
      - option "Deleted" [selected]
  - generic [ref=f31e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f31e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f31e40]:
    - text: Completed remove
    - group [ref=f31e42]:
      - button "Restore task" [ref=f31e43]
    - checkbox "Complete Completed remove" [checked] [disabled] [ref=f31e45]
    - group [ref=f31e47]:
      - generic [ref=f31e48]:
        - text: Task notes
        - textbox "Task notes" [disabled] [ref=f31e49]: Deleted Ω note second line
      - button "Save notes" [disabled] [ref=f31e50]
    - group [ref=f31e52]:
      - generic [ref=f31e53]:
        - text: Task due date
        - textbox "Task due date" [disabled] [ref=f31e54]: 2036-02-29
      - button "Save due date" [disabled] [ref=f31e55]
    - group [ref=f31e57]:
      - generic [ref=f31e58]:
        - text: Destination project
        - combobox "Destination project" [disabled] [ref=f31e59]:
          - option "task-012 Position first owner" [disabled] [selected]
          - option "task-012 Position second owner" [disabled]
          - option "task-018 Import restart" [disabled]
          - option "task-012 Search Mixed first" [disabled]
          - option "task-012 Search mixed last" [disabled]
          - option "task-012 Search double gap" [disabled]
          - option "task-012 Whitespace Saved first" [disabled]
          - option "task-020 Bulk first owner" [disabled]
          - option "task-020 Bulk second owner" [disabled]
          - option "task-020 Bulk protected" [disabled]
          - option "task-020 Bulk restart first" [disabled]
          - option "task-020 Bulk restart second" [disabled]
          - option "task-020 Defaults independent" [disabled]
          - option "task-020 Defaults inheritance" [disabled]
          - option "task-020 Defaults renamed" [disabled]
      - button "Move task" [disabled] [ref=f31e60]
    - group [ref=f31e62]:
      - generic [ref=f31e63]:
        - text: New task title
        - textbox "New task title" [disabled] [ref=f31e64]
      - button "Rename task" [disabled] [ref=f31e65]
    - generic [ref=f31e67]:
      - text: Task priority
      - combobox "Task priority" [disabled] [ref=f31e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
```