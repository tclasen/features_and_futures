# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 040 moving under combined filters retains source range and independent data
- Location: runs/instruction-effects/eval-002/tasks/task-011/suite/move-task.spec.mjs:25:2

# Error details

```
Test timeout of 20000ms exceeded.
```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - button "Projects" [ref=f1e3] [cursor=pointer]
  - heading "task-011 Filtered transfer source" [level=1] [ref=f1e4]
  - generic [ref=f1e5]:
    - generic [ref=f1e6]:
      - generic [ref=f1e7]: New project name
      - textbox "New project name" [ref=f1e8]: task-011 Filtered transfer source
    - button "Rename project" [ref=f1e9] [cursor=pointer]
  - generic [ref=f1e10]:
    - generic [ref=f1e11]:
      - generic [ref=f1e12]: Task title
      - textbox "Task title" [ref=f1e13]
    - button "Create task" [ref=f1e14] [cursor=pointer]
  - generic [ref=f1e15]: Task filter
  - combobox "Task filter" [ref=f1e16]:
    - option "All"
    - option "Open" [selected]
    - option "Completed"
  - generic [ref=f1e17]: Priority filter
  - combobox "Priority filter" [ref=f1e18]:
    - option "All"
    - option "Low"
    - option "Normal"
    - option "High" [selected]
  - generic [ref=f1e19]: Default task priority
  - combobox "Default task priority" [ref=f1e20]:
    - option "Low"
    - option "Normal" [selected]
    - option "High"
  - generic [ref=f1e21]:
    - generic [ref=f1e22]:
      - text: Due from
      - textbox "Due from" [ref=f1e23]: 2033-01-01
    - generic [ref=f1e24]:
      - text: Due through
      - textbox "Due through" [ref=f1e25]: 2033-01-01
    - button "Apply due range" [active] [ref=f1e26] [cursor=pointer]
  - generic [ref=f1e27]:
    - generic [ref=f1e28]:
      - generic [ref=f1e29]: Filtered first
      - checkbox "Complete Filtered first" [ref=f1e30]
      - combobox "Task priority" [ref=f1e31]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - textbox "New task title" [ref=f1e32]: Filtered first
      - button "Rename task" [ref=f1e33] [cursor=pointer]
      - textbox "Task due date" [ref=f1e34]: 2033-01-01
      - button "Save due date" [ref=f1e35] [cursor=pointer]
      - combobox "Destination project" [ref=f1e36]
      - button "Move task" [ref=f1e37] [cursor=pointer]
    - generic [ref=f1e38]:
      - generic [ref=f1e39]: Filtered moving
      - checkbox "Complete Filtered moving" [ref=f1e40]
      - combobox "Task priority" [ref=f1e41]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - textbox "New task title" [ref=f1e42]: Filtered moving
      - button "Rename task" [ref=f1e43] [cursor=pointer]
      - textbox "Task due date" [ref=f1e44]: 2033-01-01
      - button "Save due date" [ref=f1e45] [cursor=pointer]
      - combobox "Destination project" [ref=f1e46]
      - button "Move task" [ref=f1e47] [cursor=pointer]
    - generic [ref=f1e48]:
      - generic [ref=f1e49]: Filtered last
      - checkbox "Complete Filtered last" [ref=f1e50]
      - combobox "Task priority" [ref=f1e51]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - textbox "New task title" [ref=f1e52]: Filtered last
      - button "Rename task" [ref=f1e53] [cursor=pointer]
      - textbox "Task due date" [ref=f1e54]: 2033-01-01
      - button "Save due date" [ref=f1e55] [cursor=pointer]
      - combobox "Destination project" [ref=f1e56]
      - button "Move task" [ref=f1e57] [cursor=pointer]
```