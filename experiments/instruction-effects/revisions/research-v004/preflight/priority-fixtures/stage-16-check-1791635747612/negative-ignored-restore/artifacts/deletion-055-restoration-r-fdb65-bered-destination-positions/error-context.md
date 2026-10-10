# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deletion.spec.mjs >> 055 restoration retains reserved order explicit priority completion and remembered destination positions
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-016-draft/suite/deletion.spec.mjs:17:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "1/4 completed"
Received: "0/3 completed"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

```
Error: Object with guid response@8fa95f6e8790f9033819a39d03c8a93b was not bound in the connection
```

# Page snapshot

```yaml
- generic [active] [ref=f25e1]:
  - heading "task-016 Deletion order" [level=1] [ref=f25e2]
  - group [ref=f25e4]:
    - button "Projects" [ref=f25e5]
  - group [ref=f25e7]:
    - generic [ref=f25e8]:
      - text: Task search
      - textbox "Task search" [ref=f25e9]
    - button "Search tasks" [ref=f25e10]
  - group [ref=f25e12]:
    - generic [ref=f25e13]:
      - text: Due from
      - textbox "Due from" [ref=f25e14]
    - generic [ref=f25e15]:
      - text: Due through
      - textbox "Due through" [ref=f25e16]
    - button "Apply due range" [ref=f25e17]
  - group [ref=f25e19]:
    - generic [ref=f25e20]:
      - text: New project name
      - textbox "New project name" [ref=f25e21]
    - button "Rename project" [ref=f25e22]
  - generic [ref=f25e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f25e25]:
      - option "Low" [selected]
      - option "Normal"
      - option "High"
  - group [ref=f25e27]:
    - generic [ref=f25e28]:
      - text: Task title
      - textbox "Task title" [ref=f25e29]
    - button "Create task" [ref=f25e30]
  - generic [ref=f25e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f25e33]:
      - option "All"
      - option "Open"
      - option "Completed"
      - option "Deleted" [selected]
  - generic [ref=f25e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f25e36]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f25e37]:
    - text: Reserved
    - group [ref=f25e39]:
      - button "Restore task" [ref=f25e40]
    - checkbox "Complete Reserved" [checked] [disabled] [ref=f25e42]
    - group [ref=f25e44]:
      - generic [ref=f25e45]:
        - text: Task notes
        - textbox "Task notes" [disabled] [ref=f25e46]: Restore original note
      - button "Save notes" [disabled] [ref=f25e47]
    - group [ref=f25e49]:
      - generic [ref=f25e50]:
        - text: Task due date
        - textbox "Task due date" [disabled] [ref=f25e51]: 2037-01-01
      - button "Save due date" [disabled] [ref=f25e52]
    - group [ref=f25e54]:
      - generic [ref=f25e55]:
        - text: Destination project
        - combobox "Destination project" [disabled] [ref=f25e56]:
          - option "task-012 Position first owner" [disabled] [selected]
          - option "task-012 Position second owner" [disabled]
          - option "task-012 Search Mixed first" [disabled]
          - option "task-012 Search mixed last" [disabled]
          - option "task-012 Search double gap" [disabled]
          - option "task-012 Whitespace Saved first" [disabled]
          - option "task-016 Deletion target" [disabled]
      - button "Move task" [disabled] [ref=f25e57]
    - group [ref=f25e59]:
      - generic [ref=f25e60]:
        - text: New task title
        - textbox "New task title" [disabled] [ref=f25e61]
      - button "Rename task" [disabled] [ref=f25e62]
    - generic [ref=f25e64]:
      - text: Task priority
      - combobox "Task priority" [disabled] [ref=f25e65]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
```