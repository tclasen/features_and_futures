# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-notes-edit.spec.mjs >> 088 directory notes preserve literal text every intersection and other fields
- Location: experiments/instruction-effects/revisions/research-v008/preflight/priority-fixtures/final030-third-executed-suite/directory-notes-edit.spec.mjs:37:2

# Error details

```
Test timeout of 90000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=f98e1]:
  - heading "Task directory" [level=1] [ref=f98e2]
  - text: 0/0 completed
  - group [ref=f98e4]:
    - button "Complete visible tasks" [disabled] [ref=f98e5]
  - group [ref=f98e7]:
    - button "Reopen visible tasks" [disabled] [ref=f98e8]
  - paragraph [ref=f98e9]: No matching tasks
  - group [ref=f98e11]:
    - button "Delete visible tasks" [disabled] [ref=f98e12]
  - group [ref=f98e14]:
    - button "Restore visible tasks" [disabled] [ref=f98e15]
  - group [ref=f98e17]:
    - generic [ref=f98e18]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f98e19]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f98e20]
  - group [ref=f98e22]:
    - generic [ref=f98e23]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f98e24]
    - button "Save visible due date" [disabled] [ref=f98e25]
  - group [ref=f98e27]:
    - generic [ref=f98e28]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [disabled] [ref=f98e29]
    - button "Save visible notes" [disabled] [ref=f98e30]
  - group [ref=f98e32]:
    - button "Export matching workspace" [ref=f98e33]
  - group [ref=f98e35]:
    - button "Projects" [ref=f98e36]
  - generic [ref=f98e38]:
    - text: Directory order
    - combobox "Directory order" [ref=f98e39]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f98e41]:
    - text: Project scope
    - combobox "Project scope" [ref=f98e42]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f98e44]:
    - text: Task filter
    - combobox "Task filter" [ref=f98e45]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
      - option "Deleted"
  - generic [ref=f98e47]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f98e48]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - group [ref=f98e50]:
    - generic [ref=f98e51]:
      - text: Directory search
      - textbox "Directory search" [ref=f98e52]: task-030 Notes batch record
    - button "Search directory" [ref=f98e53]
  - group [ref=f98e55]:
    - generic [ref=f98e56]:
      - text: Due from
      - textbox "Due from" [ref=f98e57]: 2064-02-29
    - generic [ref=f98e58]:
      - text: Due through
      - textbox "Due through" [ref=f98e59]: 2064-02-29
    - button "Apply due range" [ref=f98e60]
```