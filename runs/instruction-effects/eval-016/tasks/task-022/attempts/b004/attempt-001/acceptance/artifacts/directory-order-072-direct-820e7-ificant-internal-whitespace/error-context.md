# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-order.spec.mjs >> 072 directory ordering includes deleted archived records and significant internal whitespace
- Location: runs/instruction-effects/eval-016/tasks/task-022/suite/directory-order.spec.mjs:25:2

# Error details

```
Test timeout of 20000ms exceeded.
```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading [level=1] [ref=f1e4]:
    - link "Workboard" [ref=f1e5] [cursor=pointer]:
      - /url: /
  - generic [ref=f1e6]:
    - button "Projects" [ref=f1e7] [cursor=pointer]
    - link "Download project" [ref=f1e8] [cursor=pointer]:
      - /url: /api/projects/1143/export
    - heading "task-022 Ordering archived second" [level=2] [ref=f1e9]
    - generic [ref=f1e10]:
      - generic [ref=f1e11]: New project name
      - generic [ref=f1e12]:
        - textbox "New project name" [ref=f1e13]: task-022 Ordering archived second
        - button "Rename project" [ref=f1e14] [cursor=pointer]
    - generic [ref=f1e15]:
      - generic [ref=f1e16]: Task title
      - generic [ref=f1e17]:
        - textbox "Task title" [ref=f1e18]
        - button "Create task" [ref=f1e19] [cursor=pointer]
    - generic [ref=f1e20]: Task search
    - textbox "Task search" [ref=f1e21]
    - button "Search tasks" [ref=f1e22] [cursor=pointer]
    - generic [ref=f1e23]: Default task priority
    - combobox "Default task priority" [ref=f1e24]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
    - generic [ref=f1e25]: Task filter
    - combobox "Task filter" [ref=f1e26]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
    - generic [ref=f1e27]: Priority filter
    - combobox "Priority filter" [ref=f1e28]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
    - generic [ref=f1e29]: Due from
    - textbox "Due from" [ref=f1e30]
    - generic [ref=f1e31]: Due through
    - textbox "Due through" [ref=f1e32]
    - button "Apply due range" [ref=f1e33] [cursor=pointer]
```