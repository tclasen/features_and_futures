# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority.spec.mjs >> 019 independent priorities default to Normal and persist through rename
- Location: runs/instruction-effects/eval-002/decisions/task-012-draft/suite/priority.spec.mjs:19:3

# Error details

```
Error: Task priority must be durable before the next navigation

Task priority must be durable before the next navigation

expect(received).toBe(expected) // Object.is equality

Expected: "High"
Received: "Normal"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

```
Error: Object with guid response@6e86cf9bc4141fac0855912108976776 was not bound in the connection
```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - heading "task-012 Priority ownership" [level=1] [ref=f5e2]
  - group [ref=f5e4]:
    - button "Projects" [ref=f5e5]
  - group [ref=f5e7]:
    - generic [ref=f5e8]:
      - text: Due from
      - textbox "Due from" [ref=f5e9]
    - generic [ref=f5e10]:
      - text: Due through
      - textbox "Due through" [ref=f5e11]
    - button "Apply due range" [ref=f5e12]
  - group [ref=f5e14]:
    - generic [ref=f5e15]:
      - text: New project name
      - textbox "New project name" [ref=f5e16]
    - button "Rename project" [ref=f5e17]
  - generic [ref=f5e19]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f5e20]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f5e22]:
    - generic [ref=f5e23]:
      - text: Task title
      - textbox "Task title" [ref=f5e24]
    - button "Create task" [ref=f5e25]
  - generic [ref=f5e27]:
    - text: Task filter
    - combobox "Task filter" [ref=f5e28]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f5e30]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f5e31]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f5e32]:
    - text: Priority first
    - checkbox "Complete Priority first" [ref=f5e34]
    - group [ref=f5e36]:
      - generic [ref=f5e37]:
        - text: Task due date
        - textbox "Task due date" [ref=f5e38]
      - button "Save due date" [ref=f5e39]
    - group [ref=f5e41]:
      - generic [ref=f5e42]:
        - text: Destination project
        - combobox "Destination project" [disabled] [ref=f5e43]
      - button "Move task" [disabled] [ref=f5e44]
    - group [ref=f5e46]:
      - generic [ref=f5e47]:
        - text: New task title
        - textbox "New task title" [ref=f5e48]
      - button "Rename task" [ref=f5e49]
    - generic [ref=f5e51]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e52]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f5e53]:
    - text: Priority second
    - checkbox "Complete Priority second" [ref=f5e55]
    - group [ref=f5e57]:
      - generic [ref=f5e58]:
        - text: Task due date
        - textbox "Task due date" [ref=f5e59]
      - button "Save due date" [ref=f5e60]
    - group [ref=f5e62]:
      - generic [ref=f5e63]:
        - text: Destination project
        - combobox "Destination project" [disabled] [ref=f5e64]
      - button "Move task" [disabled] [ref=f5e65]
    - group [ref=f5e67]:
      - generic [ref=f5e68]:
        - text: New task title
        - textbox "New task title" [ref=f5e69]
      - button "Rename task" [ref=f5e70]
    - generic [ref=f5e72]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e73]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
```