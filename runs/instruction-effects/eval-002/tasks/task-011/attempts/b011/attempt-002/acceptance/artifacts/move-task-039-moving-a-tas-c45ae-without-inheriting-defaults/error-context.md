# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 039 moving a task preserves data and destination order without inheriting defaults
- Location: runs/instruction-effects/eval-002/tasks/task-011/suite/move-task.spec.mjs:14:2

# Error details

```
Test timeout of 20000ms exceeded.
```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - button "Projects" [ref=f1e3] [cursor=pointer]
  - heading "task-011 Transfer source" [level=1] [ref=f1e4]
  - generic [ref=f1e5]:
    - generic [ref=f1e6]:
      - generic [ref=f1e7]: New project name
      - textbox "New project name" [ref=f1e8]: task-011 Transfer source
    - button "Rename project" [ref=f1e9] [cursor=pointer]
  - generic [ref=f1e10]:
    - generic [ref=f1e11]:
      - generic [ref=f1e12]: Task title
      - textbox "Task title" [ref=f1e13]
    - button "Create task" [ref=f1e14] [cursor=pointer]
  - generic [ref=f1e15]: Task filter
  - combobox "Task filter" [ref=f1e16]:
    - option "All" [selected]
    - option "Open"
    - option "Completed"
  - generic [ref=f1e17]: Priority filter
  - combobox "Priority filter" [ref=f1e18]:
    - option "All" [selected]
    - option "Low"
    - option "Normal"
    - option "High"
  - generic [ref=f1e19]: Default task priority
  - combobox "Default task priority" [ref=f1e20]:
    - option "Low"
    - option "Normal" [selected]
    - option "High"
  - generic [ref=f1e21]:
    - generic [ref=f1e22]:
      - text: Due from
      - textbox "Due from" [ref=f1e23]
    - generic [ref=f1e24]:
      - text: Due through
      - textbox "Due through" [ref=f1e25]
    - button "Apply due range" [ref=f1e26] [cursor=pointer]
  - generic [ref=f1e27]:
    - generic [ref=f1e28]:
      - generic [ref=f1e29]: Transferred complete
      - checkbox "Complete Transferred complete" [checked] [ref=f1e30]
      - combobox "Task priority" [ref=f1e31]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - textbox "New task title" [ref=f1e32]: Transferred complete
      - button "Rename task" [ref=f1e33] [cursor=pointer]
      - textbox "Task due date" [ref=f1e34]: 2032-02-29
      - button "Save due date" [ref=f1e35] [cursor=pointer]
      - combobox "Destination project" [ref=f1e36]
      - button "Move task" [ref=f1e37] [cursor=pointer]
    - generic [ref=f1e38]:
      - generic [ref=f1e39]: Source remaining
      - checkbox "Complete Source remaining" [ref=f1e40]
      - combobox "Task priority" [ref=f1e41]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
      - textbox "New task title" [ref=f1e42]: Source remaining
      - button "Rename task" [ref=f1e43] [cursor=pointer]
      - textbox "Task due date" [ref=f1e44]
      - button "Save due date" [ref=f1e45] [cursor=pointer]
      - combobox "Destination project" [ref=f1e46]
      - button "Move task" [ref=f1e47] [cursor=pointer]
```