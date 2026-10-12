# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 011 seed process-restart persistence checks
- Location: runs/instruction-effects/eval-016/tasks/task-018/suite/workboard.spec.mjs:157:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "2028-02-29"
Received: ""

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=f2e2]:
  - heading [level=1] [ref=f2e4]:
    - link "Workboard" [ref=f2e5] [cursor=pointer]:
      - /url: /
  - generic [ref=f2e6]:
    - button "Projects" [ref=f2e7] [cursor=pointer]
    - link "Download project" [ref=f2e8] [cursor=pointer]:
      - /url: /api/projects/799/export
    - heading "task-018 Persistence renamed" [level=2] [ref=f2e9]
    - generic [ref=f2e10]:
      - generic [ref=f2e11]: New project name
      - generic [ref=f2e12]:
        - textbox "New project name" [ref=f2e13]: task-018 Persistence renamed
        - button "Rename project" [ref=f2e14] [cursor=pointer]
    - generic [ref=f2e15]:
      - generic [ref=f2e16]: Task title
      - generic [ref=f2e17]:
        - textbox "Task title" [ref=f2e18]
        - button "Create task" [ref=f2e19] [cursor=pointer]
    - generic [ref=f2e20]: Task search
    - textbox "Task search" [ref=f2e21]
    - button "Search tasks" [ref=f2e22] [cursor=pointer]
    - generic [ref=f2e23]: Default task priority
    - combobox "Default task priority" [ref=f2e24]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
    - generic [ref=f2e25]: Task filter
    - combobox "Task filter" [ref=f2e26]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
    - generic [ref=f2e27]: Priority filter
    - combobox "Priority filter" [ref=f2e28]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
    - generic [ref=f2e29]: Due from
    - textbox "Due from" [ref=f2e30]
    - generic [ref=f2e31]: Due through
    - textbox "Due through" [ref=f2e32]
    - button "Apply due range" [ref=f2e33] [cursor=pointer]
    - generic [ref=f2e35]:
      - generic [ref=f2e36]: Memory kept
      - checkbox "Complete Memory kept" [checked] [ref=f2e37]
      - textbox "New task title" [ref=f2e38]: Memory kept
      - button "Rename task" [ref=f2e39] [cursor=pointer]
      - combobox "Task priority" [ref=f2e40]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - textbox "Task due date" [ref=f2e41]
      - button "Save due date" [ref=f2e42] [cursor=pointer]
      - textbox "Task notes" [ref=f2e43]
      - button "Save notes" [ref=f2e44] [cursor=pointer]
      - combobox "Destination project" [ref=f2e45]:
        - option "task-001 Alpha create" [selected]
        - option "task-001 Blank validation sentinel"
        - option "task-001 Order first"
        - option "task-001 Order second"
        - option "task-001 Persistence sentinel"
        - option "task-002 Alpha create"
        - option "task-002 Blank validation sentinel"
        - option "task-002 Order first"
        - option "task-002 Order second"
        - option "task-002 Task reload"
        - option "task-002 Task invalid"
        - option "task-002 Task owner"
        - option "task-002 Other project"
        - option "task-002 Task filters"
        - option "task-002 Persistence sentinel"
        - option "task-003 Alpha create"
        - option "task-003 Blank validation sentinel"
        - option "task-003 Order first"
        - option "task-003 Order second"
        - option "task-003 Task reload"
        - option "task-003 Task invalid"
        - option "task-003 Task owner"
        - option "task-003 Other project"
        - option "task-003 Task filters"
        - option "task-003 Archive lifecycle"
        - option "task-003 Archive tasks"
        - option "task-003 Summary project"
        - option "task-004 Alpha create"
        - option "task-004 Blank validation sentinel"
        - option "task-004 Order first"
        - option "task-004 Order second"
        - option "task-004 Task reload"
        - option "task-004 Task invalid"
        - option "task-004 Task owner"
        - option "task-004 Other project"
        - option "task-004 Task filters"
        - option "task-004 Archive lifecycle"
        - option "task-004 Archive tasks"
        - option "task-004 Summary project"
        - option "task-004 Identity updated"
        - option "task-004 Identity second"
        - option "task-004 Rename invalid"
        - option "task-004 Rename archive"
        - option "task-005 Alpha create"
        - option "task-005 Blank validation sentinel"
        - option "task-005 Order first"
        - option "task-005 Order second"
        - option "task-005 Task reload"
        - option "task-005 Task invalid"
        - option "task-005 Task owner"
        - option "task-005 Other project"
        - option "task-005 Task filters"
        - option "task-005 Archive lifecycle"
        - option "task-005 Archive tasks"
        - option "task-005 Summary project"
        - option "task-005 Identity updated"
        - option "task-005 Identity second"
        - option "task-005 Rename invalid"
        - option "task-005 Rename archive"
        - option "task-005 Task rename identity"
        - option "task-005 Task rename invalid"
        - option "task-005 Task rename archive"
        - option "task-006 Priority ownership"
        - option "task-006 Priority other owner"
        - option "task-006 Priority completion"
        - option "task-006 Priority archive"
        - option "task-006 Alpha create"
        - option "task-006 Blank validation sentinel"
        - option "task-006 Order first"
        - option "task-006 Order second"
        - option "task-006 Task reload"
        - option "task-006 Task invalid"
        - option "task-006 Task owner"
        - option "task-006 Other project"
        - option "task-006 Task filters"
        - option "task-006 Archive lifecycle"
        - option "task-006 Archive tasks"
        - option "task-006 Summary project"
        - option "task-006 Identity updated"
        - option "task-006 Identity second"
        - option "task-006 Rename invalid"
        - option "task-006 Rename archive"
        - option "task-006 Task rename identity"
        - option "task-006 Task rename invalid"
        - option "task-006 Task rename archive"
        - option "task-007 Priority intersection"
        - option "task-007 Priority live filters"
        - option "task-007 Priority rename filters"
        - option "task-007 Archived combined filters"
        - option "task-007 Priority ownership"
        - option "task-007 Priority other owner"
        - option "task-007 Priority completion"
        - option "task-007 Priority archive"
        - option "task-007 Alpha create"
        - option "task-007 Blank validation sentinel"
        - option "task-007 Order first"
        - option "task-007 Order second"
        - option "task-007 Task reload"
        - option "task-007 Task invalid"
        - option "task-007 Task owner"
        - option "task-007 Other project"
        - option "task-007 Task filters"
        - option "task-007 Archive lifecycle"
        - option "task-007 Archive tasks"
        - option "task-007 Summary project"
        - option "task-007 Identity updated"
        - option "task-007 Identity second"
        - option "task-007 Rename invalid"
        - option "task-007 Rename archive"
        - option "task-007 Task rename identity"
        - option "task-007 Task rename invalid"
        - option "task-007 Task rename archive"
        - option "task-008 Defaults independent"
        - option "task-008 Defaults inheritance"
        - option "task-008 Defaults renamed"
        - option "task-008 Priority intersection"
        - option "task-008 Priority live filters"
        - option "task-008 Priority rename filters"
        - option "task-008 Archived combined filters"
        - option "task-008 Priority ownership"
        - option "task-008 Priority other owner"
        - option "task-008 Priority completion"
        - option "task-008 Priority archive"
        - option "task-008 Alpha create"
        - option "task-008 Blank validation sentinel"
        - option "task-008 Order first"
        - option "task-008 Order second"
        - option "task-008 Task reload"
        - option "task-008 Task invalid"
        - option "task-008 Task owner"
        - option "task-008 Other project"
        - option "task-008 Task filters"
        - option "task-008 Archive lifecycle"
        - option "task-008 Archive tasks"
        - option "task-008 Summary project"
        - option "task-008 Identity updated"
        - option "task-008 Identity second"
        - option "task-008 Rename invalid"
        - option "task-008 Rename archive"
        - option "task-008 Task rename identity"
        - option "task-008 Task rename invalid"
        - option "task-008 Task rename archive"
        - option "task-009 Defaults independent"
        - option "task-009 Defaults inheritance"
        - option "task-009 Defaults renamed"
        - option "task-009 Calendar persistence"
        - option "task-009 Calendar validation"
        - option "task-009 Calendar independence"
        - option "task-009 Calendar second owner"
        - option "task-009 Calendar archival"
        - option "task-009 Priority intersection"
        - option "task-009 Priority live filters"
        - option "task-009 Priority rename filters"
        - option "task-009 Archived combined filters"
        - option "task-009 Priority ownership"
        - option "task-009 Priority other owner"
        - option "task-009 Priority completion"
        - option "task-009 Priority archive"
        - option "task-009 Alpha create"
        - option "task-009 Blank validation sentinel"
        - option "task-009 Order first"
        - option "task-009 Order second"
        - option "task-009 Task reload"
        - option "task-009 Task invalid"
        - option "task-009 Task owner"
        - option "task-009 Other project"
        - option "task-009 Task filters"
        - option "task-009 Archive lifecycle"
        - option "task-009 Archive tasks"
        - option "task-009 Summary project"
        - option "task-009 Identity updated"
        - option "task-009 Identity second"
        - option "task-009 Rename invalid"
        - option "task-009 Rename archive"
        - option "task-009 Task rename identity"
        - option "task-009 Task rename invalid"
        - option "task-009 Task rename archive"
        - option "task-010 Defaults independent"
        - option "task-010 Defaults inheritance"
        - option "task-010 Defaults renamed"
        - option "task-010 Calendar persistence"
        - option "task-010 Calendar validation"
        - option "task-010 Calendar independence"
        - option "task-010 Calendar second owner"
        - option "task-010 Calendar archival"
        - option "task-010 Range boundaries"
        - option "task-010 Range intersections"
        - option "task-010 Range validation"
        - option "task-010 Range archival"
        - option "task-010 Range owner renamed"
        - option "task-010 Priority intersection"
        - option "task-010 Priority live filters"
        - option "task-010 Priority rename filters"
        - option "task-010 Archived combined filters"
        - option "task-010 Priority ownership"
        - option "task-010 Priority other owner"
        - option "task-010 Priority completion"
        - option "task-010 Priority archive"
        - option "task-010 Alpha create"
        - option "task-010 Blank validation sentinel"
        - option "task-010 Order first"
        - option "task-010 Order second"
        - option "task-010 Task reload"
        - option "task-010 Task invalid"
        - option "task-010 Task owner"
        - option "task-010 Other project"
        - option "task-010 Task filters"
        - option "task-010 Archive lifecycle"
        - option "task-010 Archive tasks"
        - option "task-010 Summary project"
        - option "task-010 Identity updated"
        - option "task-010 Identity second"
        - option "task-010 Rename invalid"
        - option "task-010 Rename archive"
        - option "task-010 Task rename identity"
        - option "task-010 Task rename invalid"
        - option "task-010 Task rename archive"
        - option "task-011 Defaults independent"
        - option "task-011 Defaults inheritance"
        - option "task-011 Defaults renamed"
        - option "task-011 Calendar persistence"
        - option "task-011 Calendar validation"
        - option "task-011 Calendar independence"
        - option "task-011 Calendar second owner"
        - option "task-011 Calendar archival"
        - option "task-011 Range boundaries"
        - option "task-011 Range intersections"
        - option "task-011 Range validation"
        - option "task-011 Range archival"
        - option "task-011 Range owner renamed"
        - option "task-011 Transfer target"
        - option "task-011 Transfer source"
        - option "task-011 Filtered transfer target"
        - option "task-011 Filtered transfer source"
        - option "task-011 Options first"
        - option "task-011 Options second"
        - option "task-011 Options owner"
        - option "task-011 Read-only transfer target"
        - option "task-011 Read-only transfer owner"
        - option "task-011 Priority intersection"
        - option "task-011 Priority live filters"
        - option "task-011 Priority rename filters"
        - option "task-011 Archived combined filters"
        - option "task-011 Priority ownership"
        - option "task-011 Priority other owner"
        - option "task-011 Priority completion"
        - option "task-011 Priority archive"
        - option "task-011 Alpha create"
        - option "task-011 Blank validation sentinel"
        - option "task-011 Order first"
        - option "task-011 Order second"
        - option "task-011 Task reload"
        - option "task-011 Task invalid"
        - option "task-011 Task owner"
        - option "task-011 Other project"
        - option "task-011 Task filters"
        - option "task-011 Archive lifecycle"
        - option "task-011 Archive tasks"
        - option "task-011 Summary project"
        - option "task-011 Transfer restart origin"
        - option "task-011 Identity updated"
        - option "task-011 Identity second"
        - option "task-011 Rename invalid"
        - option "task-011 Rename archive"
        - option "task-011 Task rename identity"
        - option "task-011 Task rename invalid"
        - option "task-011 Task rename archive"
        - option "task-012 Defaults independent"
        - option "task-012 Defaults inheritance"
        - option "task-012 Defaults renamed"
        - option "task-012 Calendar persistence"
        - option "task-012 Calendar validation"
        - option "task-012 Calendar independence"
        - option "task-012 Calendar second owner"
        - option "task-012 Calendar archival"
        - option "task-012 Range boundaries"
        - option "task-012 Range intersections"
        - option "task-012 Range validation"
        - option "task-012 Range archival"
        - option "task-012 Range owner renamed"
        - option "task-012 Transfer target"
        - option "task-012 Transfer source"
        - option "task-012 Filtered transfer target"
        - option "task-012 Filtered transfer source"
        - option "task-012 Options first"
        - option "task-012 Options second"
        - option "task-012 Options owner"
        - option "task-012 Read-only transfer target"
        - option "task-012 Read-only transfer owner"
        - option "task-012 Priority intersection"
        - option "task-012 Priority live filters"
        - option "task-012 Priority rename filters"
        - option "task-012 Archived combined filters"
        - option "task-012 Priority ownership"
        - option "task-012 Priority other owner"
        - option "task-012 Priority completion"
        - option "task-012 Priority archive"
        - option "task-012 Return holding"
        - option "task-012 Return owner"
        - option "task-012 Return identity holding"
        - option "task-012 Returned owner renamed"
        - option "task-012 Position second owner"
        - option "task-012 Position third owner"
        - option "task-012 Position first owner"
        - option "task-012 Alpha create"
        - option "task-012 Blank validation sentinel"
        - option "task-012 Order first"
        - option "task-012 Order second"
        - option "task-012 Task reload"
        - option "task-012 Task invalid"
        - option "task-012 Task owner"
        - option "task-012 Other project"
        - option "task-012 Task filters"
        - option "task-012 Archive lifecycle"
        - option "task-012 Archive tasks"
        - option "task-012 Summary project"
        - option "task-012 Transfer restart origin"
        - option "task-012 Identity updated"
        - option "task-012 Identity second"
        - option "task-012 Rename invalid"
        - option "task-012 Rename archive"
        - option "task-012 Task rename identity"
        - option "task-012 Task rename invalid"
        - option "task-012 Task rename archive"
        - option "task-013 Defaults independent"
        - option "task-013 Defaults inheritance"
        - option "task-013 Defaults renamed"
        - option "task-013 Calendar persistence"
        - option "task-013 Calendar validation"
        - option "task-013 Calendar independence"
        - option "task-013 Calendar second owner"
        - option "task-013 Calendar archival"
        - option "task-013 Range boundaries"
        - option "task-013 Range intersections"
        - option "task-013 Range validation"
        - option "task-013 Range archival"
        - option "task-013 Range owner renamed"
        - option "task-013 Transfer target"
        - option "task-013 Transfer source"
        - option "task-013 Filtered transfer target"
        - option "task-013 Filtered transfer source"
        - option "task-013 Options first"
        - option "task-013 Options second"
        - option "task-013 Options owner"
        - option "task-013 Read-only transfer target"
        - option "task-013 Read-only transfer owner"
        - option "task-013 Priority intersection"
        - option "task-013 Priority live filters"
        - option "task-013 Priority rename filters"
        - option "task-013 Archived combined filters"
        - option "task-013 Priority ownership"
        - option "task-013 Priority other owner"
        - option "task-013 Priority completion"
        - option "task-013 Priority archive"
        - option "task-013 Return holding"
        - option "task-013 Return owner"
        - option "task-013 Return identity holding"
        - option "task-013 Returned owner renamed"
        - option "task-013 Position second owner"
        - option "task-013 Position third owner"
        - option "task-013 Position first owner"
        - option "task-013 Search Mixed first"
        - option "task-013 Search unrelated"
        - option "task-013 Search mixed last"
        - option "task-013 Search double gap"
        - option "task-013 Search double sentinel"
        - option "task-013 Search task intersections"
        - option "task-013 Search internal spacing"
        - option "task-013 Alpha create"
        - option "task-013 Blank validation sentinel"
        - option "task-013 Order first"
        - option "task-013 Order second"
        - option "task-013 Task reload"
        - option "task-013 Task invalid"
        - option "task-013 Task owner"
        - option "task-013 Other project"
        - option "task-013 Task filters"
        - option "task-013 Archive lifecycle"
        - option "task-013 Archive tasks"
        - option "task-013 Summary project"
        - option "task-013 Transfer restart origin"
        - option "task-013 Identity updated"
        - option "task-013 Identity second"
        - option "task-013 Rename invalid"
        - option "task-013 Rename archive"
        - option "task-013 Task rename identity"
        - option "task-013 Task rename invalid"
        - option "task-013 Task rename archive"
        - option "task-014 Defaults independent"
        - option "task-014 Defaults inheritance"
        - option "task-014 Defaults renamed"
        - option "task-014 Calendar persistence"
        - option "task-014 Calendar validation"
        - option "task-014 Calendar independence"
        - option "task-014 Calendar second owner"
        - option "task-014 Calendar archival"
        - option "task-014 Range boundaries"
        - option "task-014 Range intersections"
        - option "task-014 Range validation"
        - option "task-014 Range archival"
        - option "task-014 Range owner renamed"
        - option "task-014 Transfer target"
        - option "task-014 Transfer source"
        - option "task-014 Filtered transfer target"
        - option "task-014 Filtered transfer source"
        - option "task-014 Options first"
        - option "task-014 Options second"
        - option "task-014 Options owner"
        - option "task-014 Read-only transfer target"
        - option "task-014 Read-only transfer owner"
        - option "task-014 Priority intersection"
        - option "task-014 Priority live filters"
        - option "task-014 Priority rename filters"
        - option "task-014 Archived combined filters"
        - option "task-014 Priority ownership"
        - option "task-014 Priority other owner"
        - option "task-014 Priority completion"
        - option "task-014 Priority archive"
        - option "task-014 Return holding"
        - option "task-014 Return owner"
        - option "task-014 Return identity holding"
        - option "task-014 Returned owner renamed"
        - option "task-014 Position second owner"
        - option "task-014 Position third owner"
        - option "task-014 Position first owner"
        - option "task-014 Whitespace retained owner"
        - option "task-014 Whitespace Saved first"
        - option "task-014 Whitespace Saved second"
        - option "task-014 Whitespace unrelated sentinel"
        - option "task-014 Search Mixed first"
        - option "task-014 Search unrelated"
        - option "task-014 Search mixed last"
        - option "task-014 Search double gap"
        - option "task-014 Search double sentinel"
        - option "task-014 Search task intersections"
        - option "task-014 Search internal spacing"
        - option "task-014 Alpha create"
        - option "task-014 Blank validation sentinel"
        - option "task-014 Order first"
        - option "task-014 Order second"
        - option "task-014 Task reload"
        - option "task-014 Task invalid"
        - option "task-014 Task owner"
        - option "task-014 Other project"
        - option "task-014 Task filters"
        - option "task-014 Archive lifecycle"
        - option "task-014 Archive tasks"
        - option "task-014 Summary project"
        - option "task-014 Transfer restart origin"
        - option "task-014 Identity updated"
        - option "task-014 Identity second"
        - option "task-014 Rename invalid"
        - option "task-014 Rename archive"
        - option "task-014 Task rename identity"
        - option "task-014 Task rename invalid"
        - option "task-014 Task rename archive"
        - option "task-015 Defaults independent"
        - option "task-015 Defaults inheritance"
        - option "task-015 Defaults renamed"
        - option "task-015 Calendar persistence"
        - option "task-015 Calendar validation"
        - option "task-015 Calendar independence"
        - option "task-015 Calendar second owner"
        - option "task-015 Calendar archival"
        - option "task-015 Range boundaries"
        - option "task-015 Range intersections"
        - option "task-015 Range validation"
        - option "task-015 Range archival"
        - option "task-015 Range owner renamed"
        - option "task-015 Transfer target"
        - option "task-015 Transfer source"
        - option "task-015 Filtered transfer target"
        - option "task-015 Filtered transfer source"
        - option "task-015 Options first"
        - option "task-015 Options second"
        - option "task-015 Options owner"
        - option "task-015 Read-only transfer target"
        - option "task-015 Read-only transfer owner"
        - option "task-015 Notes values"
        - option "task-015 Notes target"
        - option "task-015 Notes owner"
        - option "task-015 Priority intersection"
        - option "task-015 Priority live filters"
        - option "task-015 Priority rename filters"
        - option "task-015 Archived combined filters"
        - option "task-015 Priority ownership"
        - option "task-015 Priority other owner"
        - option "task-015 Priority completion"
        - option "task-015 Priority archive"
        - option "task-015 Return holding"
        - option "task-015 Return owner"
        - option "task-015 Return identity holding"
        - option "task-015 Returned owner renamed"
        - option "task-015 Position second owner"
        - option "task-015 Position third owner"
        - option "task-015 Position first owner"
        - option "task-015 Whitespace retained owner"
        - option "task-015 Whitespace Saved first"
        - option "task-015 Whitespace Saved second"
        - option "task-015 Whitespace unrelated sentinel"
        - option "task-015 Search Mixed first"
        - option "task-015 Search unrelated"
        - option "task-015 Search mixed last"
        - option "task-015 Search double gap"
        - option "task-015 Search double sentinel"
        - option "task-015 Search task intersections"
        - option "task-015 Search internal spacing"
        - option "task-015 Alpha create"
        - option "task-015 Blank validation sentinel"
        - option "task-015 Order first"
        - option "task-015 Order second"
        - option "task-015 Task reload"
        - option "task-015 Task invalid"
        - option "task-015 Task owner"
        - option "task-015 Other project"
        - option "task-015 Task filters"
        - option "task-015 Archive lifecycle"
        - option "task-015 Archive tasks"
        - option "task-015 Summary project"
        - option "task-015 Transfer restart origin"
        - option "task-015 Identity updated"
        - option "task-015 Identity second"
        - option "task-015 Rename invalid"
        - option "task-015 Rename archive"
        - option "task-015 Task rename identity"
        - option "task-015 Task rename invalid"
        - option "task-015 Task rename archive"
        - option "task-016 Defaults independent"
        - option "task-016 Defaults inheritance"
        - option "task-016 Defaults renamed"
        - option "task-016 Deletion fields"
        - option "task-016 Deletion target"
        - option "task-016 Deletion order"
        - option "task-016 Deletion restart"
        - option "task-016 Deleted intersections"
        - option "task-016 Calendar persistence"
        - option "task-016 Calendar validation"
        - option "task-016 Calendar independence"
        - option "task-016 Calendar second owner"
        - option "task-016 Calendar archival"
        - option "task-016 Range boundaries"
        - option "task-016 Range intersections"
        - option "task-016 Range validation"
        - option "task-016 Range archival"
        - option "task-016 Range owner renamed"
        - option "task-016 Transfer target"
        - option "task-016 Transfer source"
        - option "task-016 Filtered transfer target"
        - option "task-016 Filtered transfer source"
        - option "task-016 Options first"
        - option "task-016 Options second"
        - option "task-016 Options owner"
        - option "task-016 Read-only transfer target"
        - option "task-016 Read-only transfer owner"
        - option "task-016 Notes values"
        - option "task-016 Notes target"
        - option "task-016 Notes owner"
        - option "task-016 Priority intersection"
        - option "task-016 Priority live filters"
        - option "task-016 Priority rename filters"
        - option "task-016 Archived combined filters"
        - option "task-016 Priority ownership"
        - option "task-016 Priority other owner"
        - option "task-016 Priority completion"
        - option "task-016 Priority archive"
        - option "task-016 Return holding"
        - option "task-016 Return owner"
        - option "task-016 Return identity holding"
        - option "task-016 Returned owner renamed"
        - option "task-016 Position second owner"
        - option "task-016 Position third owner"
        - option "task-016 Position first owner"
        - option "task-016 Whitespace retained owner"
        - option "task-016 Whitespace Saved first"
        - option "task-016 Whitespace Saved second"
        - option "task-016 Whitespace unrelated sentinel"
        - option "task-016 Search Mixed first"
        - option "task-016 Search unrelated"
        - option "task-016 Search mixed last"
        - option "task-016 Search double gap"
        - option "task-016 Search double sentinel"
        - option "task-016 Search task intersections"
        - option "task-016 Search internal spacing"
        - option "task-016 Alpha create"
        - option "task-016 Blank validation sentinel"
        - option "task-016 Order first"
        - option "task-016 Order second"
        - option "task-016 Task reload"
        - option "task-016 Task invalid"
        - option "task-016 Task owner"
        - option "task-016 Other project"
        - option "task-016 Task filters"
        - option "task-016 Archive lifecycle"
        - option "task-016 Archive tasks"
        - option "task-016 Summary project"
        - option "task-016 Transfer restart origin"
        - option "task-016 Identity updated"
        - option "task-016 Identity second"
        - option "task-016 Rename invalid"
        - option "task-016 Rename archive"
        - option "task-016 Task rename identity"
        - option "task-016 Task rename invalid"
        - option "task-016 Task rename archive"
        - option "task-017 Defaults independent"
        - option "task-017 Defaults inheritance"
        - option "task-017 Defaults renamed"
        - option "task-017 Deletion fields"
        - option "task-017 Deletion target"
        - option "task-017 Deletion order"
        - option "task-017 Deletion restart"
        - option "task-017 Deleted intersections"
        - option "task-017 Calendar persistence"
        - option "task-017 Calendar validation"
        - option "task-017 Calendar independence"
        - option "task-017 Calendar second owner"
        - option "task-017 Calendar archival"
        - option "task-017 Range boundaries"
        - option "task-017 Range intersections"
        - option "task-017 Range validation"
        - option "task-017 Range archival"
        - option "task-017 Range owner renamed"
        - option "task-017 Export foreign"
        - option "task-017 Export full Ω"
        - option "task-017 Export empty"
        - option "task-017 Transfer target"
        - option "task-017 Transfer source"
        - option "task-017 Filtered transfer target"
        - option "task-017 Filtered transfer source"
        - option "task-017 Options first"
        - option "task-017 Options second"
        - option "task-017 Options owner"
        - option "task-017 Read-only transfer target"
        - option "task-017 Read-only transfer owner"
        - option "task-017 Notes values"
        - option "task-017 Notes target"
        - option "task-017 Notes owner"
        - option "task-017 Priority intersection"
        - option "task-017 Priority live filters"
        - option "task-017 Priority rename filters"
        - option "task-017 Archived combined filters"
        - option "task-017 Priority ownership"
        - option "task-017 Priority other owner"
        - option "task-017 Priority completion"
        - option "task-017 Priority archive"
        - option "task-017 Return holding"
        - option "task-017 Return owner"
        - option "task-017 Return identity holding"
        - option "task-017 Returned owner renamed"
        - option "task-017 Position second owner"
        - option "task-017 Position third owner"
        - option "task-017 Position first owner"
        - option "task-017 Whitespace retained owner"
        - option "task-017 Whitespace Saved first"
        - option "task-017 Whitespace Saved second"
        - option "task-017 Whitespace unrelated sentinel"
        - option "task-017 Search Mixed first"
        - option "task-017 Search unrelated"
        - option "task-017 Search mixed last"
        - option "task-017 Search double gap"
        - option "task-017 Search double sentinel"
        - option "task-017 Search task intersections"
        - option "task-017 Search internal spacing"
        - option "task-017 Alpha create"
        - option "task-017 Blank validation sentinel"
        - option "task-017 Order first"
        - option "task-017 Order second"
        - option "task-017 Task reload"
        - option "task-017 Task invalid"
        - option "task-017 Task owner"
        - option "task-017 Other project"
        - option "task-017 Task filters"
        - option "task-017 Archive lifecycle"
        - option "task-017 Archive tasks"
        - option "task-017 Summary project"
        - option "task-017 Transfer restart origin"
        - option "task-017 Identity updated"
        - option "task-017 Identity second"
        - option "task-017 Rename invalid"
        - option "task-017 Rename archive"
        - option "task-017 Task rename identity"
        - option "task-017 Task rename invalid"
        - option "task-017 Task rename archive"
        - option "task-018 Defaults independent"
        - option "task-018 Defaults inheritance"
        - option "task-018 Defaults renamed"
        - option "task-018 Deletion fields"
        - option "task-018 Deletion target"
        - option "task-018 Deletion order"
        - option "task-018 Deletion restart"
        - option "task-018 Deleted intersections"
        - option "task-018 Calendar persistence"
        - option "task-018 Calendar validation"
        - option "task-018 Calendar independence"
        - option "task-018 Calendar second owner"
        - option "task-018 Calendar archival"
        - option "task-018 Range boundaries"
        - option "task-018 Range intersections"
        - option "task-018 Range validation"
        - option "task-018 Range archival"
        - option "task-018 Range owner renamed"
        - option "task-018 Export foreign"
        - option "task-018 Export full Ω"
        - option "task-018 Export empty"
        - option "task-018 Import origin"
        - option "task-018 Parse guard existing"
        - option "task-018 Task guard existing"
        - option "task-018 Transfer target"
        - option "task-018 Transfer source"
        - option "task-018 Filtered transfer target"
        - option "task-018 Filtered transfer source"
        - option "task-018 Options first"
        - option "task-018 Options second"
        - option "task-018 Options owner"
        - option "task-018 Read-only transfer target"
        - option "task-018 Read-only transfer owner"
        - option "task-018 Notes values"
        - option "task-018 Notes target"
        - option "task-018 Notes owner"
        - option "task-018 Priority intersection"
        - option "task-018 Priority live filters"
        - option "task-018 Priority rename filters"
        - option "task-018 Archived combined filters"
        - option "task-018 Priority ownership"
        - option "task-018 Priority other owner"
        - option "task-018 Priority completion"
        - option "task-018 Priority archive"
        - option "task-018 Return holding"
        - option "task-018 Return owner"
        - option "task-018 Return identity holding"
        - option "task-018 Returned owner renamed"
        - option "task-018 Position second owner"
        - option "task-018 Position third owner"
        - option "task-018 Position first owner"
        - option "task-018 Whitespace retained owner"
        - option "task-018 Whitespace Saved first"
        - option "task-018 Whitespace Saved second"
        - option "task-018 Whitespace unrelated sentinel"
        - option "task-018 Search Mixed first"
        - option "task-018 Search unrelated"
        - option "task-018 Search mixed last"
        - option "task-018 Search double gap"
        - option "task-018 Search double sentinel"
        - option "task-018 Search task intersections"
        - option "task-018 Search internal spacing"
        - option "task-018 Alpha create"
        - option "task-018 Blank validation sentinel"
        - option "task-018 Order first"
        - option "task-018 Order second"
        - option "task-018 Task reload"
        - option "task-018 Task invalid"
        - option "task-018 Task owner"
        - option "task-018 Other project"
        - option "task-018 Task filters"
        - option "task-018 Archive lifecycle"
        - option "task-018 Archive tasks"
        - option "task-018 Summary project"
        - option "task-018 Transfer restart origin"
      - button "Move task" [ref=f2e46] [cursor=pointer]
      - button "Delete task" [ref=f2e47] [cursor=pointer]
```

# Test source

```ts
  91  |     await page.reload();
  92  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
  93  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
  94  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
  95  |     await expectPersistedCompletion(page, 'Task filters', 'Done task', false);
  96  |     await page.reload();
  97  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  98  |   });
  99  | }
  100 | 
  101 | if (stage >= 3) {
  102 |   test('008 archive state persists and project can be restored', async ({ page }) => {
  103 |     await createProject(page, 'Archive lifecycle');
  104 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
  105 |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
  106 |     await page.reload();
  107 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  108 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  109 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
  110 |     await expect(projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  111 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  112 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  113 |   });
  114 | 
  115 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  116 |     await createProject(page, 'Archive tasks');
  117 |     await openProject(page, 'Archive tasks');
  118 |     await createTask(page, 'Retained task');
  119 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  120 |     await expectPersistedCompletion(page, 'Archive tasks', 'Retained task', true);
  121 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  122 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  123 |     await expect(projectRow(page, 'Archive tasks')).toHaveCount(0);
  124 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  125 |     await openProject(page, 'Archive tasks');
  126 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  127 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  128 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  129 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  130 |     await expect(taskRow(page, 'Retained task')).toHaveCount(0);
  131 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  132 |     await expect(taskRow(page, 'Retained task')).toBeVisible();
  133 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  134 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  135 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  136 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  137 |     await expect(projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  138 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  139 |     await openProject(page, 'Archive tasks');
  140 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  141 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  142 |   });
  143 | 
  144 |   test('010 completion summaries reflect all tasks', async ({ page }) => {
  145 |     await createProject(page, 'Summary project');
  146 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
  147 |     await openProject(page, 'Summary project');
  148 |     await createTask(page, 'Summary one');
  149 |     await createTask(page, 'Summary two');
  150 |     await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
  151 |     await expectPersistedCompletion(page, 'Summary project', 'Summary one', true);
  152 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  153 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  154 |   });
  155 | }
  156 | 
  157 | test('011 seed process-restart persistence checks', async ({ page }) => {
  158 |   await createProject(page, 'Persistence sentinel');
  159 |   if (stage >= 2) {
  160 |     await openProject(page, 'Persistence sentinel');
  161 |     if(stage>=11) {
  162 |       await createProject(page,'Transfer restart origin');await openProject(page,'Transfer restart origin');await createTask(page,'Remember me');
  163 |       await taskRow(page,'Remember me').getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName('Persistence sentinel')});
  164 |       await taskRow(page,'Remember me').getByRole('button',{name:'Move task',exact:true}).click();
  165 |       await expect(taskRow(page,'Remember me')).toHaveCount(0);
  166 |       await page.goto('/');await openProject(page,'Persistence sentinel');await expect(taskRow(page,'Remember me')).toBeVisible();
  167 |     } else {await createTask(page, 'Remember me');}
  168 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  169 |     await expectPersistedCompletion(page, 'Persistence sentinel', 'Remember me', true);
  170 |     if (stage >= 6) {
  171 |       await taskRow(page, 'Remember me').getByRole('combobox', {name:'Task priority', exact:true}).selectOption({label:'High'});
  172 |       await expectPersistedPriority(page, 'Persistence sentinel', 'Remember me', 'High');
  173 |     }
  174 |     if (stage >= 5) {
  175 |       await taskRow(page, 'Remember me').getByRole('textbox', { name: 'New task title', exact: true }).fill('Memory kept');
  176 |       await taskRow(page, 'Remember me').getByRole('button', { name: 'Rename task', exact: true }).click();
  177 |       await expect(page.getByRole('checkbox', { name: 'Complete Memory kept', exact: true })).toBeChecked();
  178 |     }
  179 |   }
  180 |   if (stage >= 4) {
  181 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  182 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  183 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  184 |   }
  185 |   if (stage >= 9) {
  186 |     const dateRow=taskRow(page,'Memory kept');
  187 |     await dateRow.getByRole('textbox',{name:'Task due date',exact:true}).fill('2028-02-29');
  188 |     await dateRow.getByRole('button',{name:'Save due date',exact:true}).click();
  189 |     const dateObserver=await page.context().newPage();
  190 |     try {
> 191 |       await expect.poll(async()=>{await dateObserver.goto('/');await openProject(dateObserver,'Persistence renamed');return taskRow(dateObserver,'Memory kept').getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2028-02-29');
      |                                                                                                                                                                                                                                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  192 |     } finally {await dateObserver.close();}
  193 |   }
  194 |   if (stage >= 8) {
  195 |     await page.getByRole('combobox', {name:'Default task priority', exact:true}).selectOption({label:'Low'});
  196 |     const observer=await page.context().newPage();
  197 |     try {
  198 |       await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Persistence renamed');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');
  199 |     } finally {await observer.close();}
  200 |   }
  201 |   if (stage >= 3) {
  202 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  203 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  204 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  205 |   }
  206 | });
  207 | 
  208 | if (stage >= 4) {
  209 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  210 |     await createProject(page, 'Identity first');
  211 |     await createProject(page, 'Identity second');
  212 |     await openProject(page, 'Identity first');
  213 |     const originalPath = new URL(page.url()).pathname;
  214 |     await createTask(page, 'Identity task');
  215 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  216 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  217 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  218 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  219 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  220 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  221 |     await page.reload();
  222 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  223 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  224 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  225 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  226 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  227 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  228 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  229 |     await openProject(page, 'Identity updated');
  230 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  231 |   });
  232 | 
  233 |   test('014 blank rename preserves original name', async ({ page }) => {
  234 |     await createProject(page, 'Rename invalid');
  235 |     await openProject(page, 'Rename invalid');
  236 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  237 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  238 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  239 |     await page.reload();
  240 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  241 |   });
  242 | 
  243 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  244 |     await createProject(page, 'Rename archive');
  245 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  246 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  247 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  248 |     await openProject(page, 'Rename archive');
  249 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  250 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  251 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  252 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  253 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();await expect(projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  254 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  255 |     await openProject(page, 'Rename archive');
  256 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  257 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  258 |   });
  259 | }
  260 | 
  261 | if (stage >= 5) {
  262 |   test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
  263 |     await createProject(page, 'Task rename identity');
  264 |     await openProject(page, 'Task rename identity');
  265 |     await createTask(page, 'Name initial');
  266 |     await createTask(page, 'Name second');
  267 |     await page.getByRole('checkbox', { name: 'Complete Name initial', exact: true }).check();
  268 |     await expectPersistedCompletion(page, 'Task rename identity', 'Name initial', true);
  269 |     await taskRow(page, 'Name initial').getByRole('textbox', { name: 'New task title', exact: true }).fill('  Name updated  ');
  270 |     await taskRow(page, 'Name initial').getByRole('button', { name: 'Rename task', exact: true }).click();
  271 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  272 |     await page.reload();
  273 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  274 |     const rows = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  275 |     expect(rows.findIndex(t => t.includes('Name updated'))).toBeLessThan(rows.findIndex(t => t.includes('Name second')));
  276 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  277 |     await expect(taskRow(page, 'Name updated')).toHaveCount(0);
  278 |     await expect(taskRow(page, 'Name second')).toBeVisible();
  279 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  280 |     await expect(taskRow(page, 'Name updated')).toBeVisible();
  281 |     await expect(taskRow(page, 'Name second')).toHaveCount(0);
  282 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  283 |     await expect(projectRow(page, 'Task rename identity').getByTestId('project-summary')).toHaveText('1/2 completed');
  284 |   });
  285 |   test('017 blank task rename preserves the original title', async ({ page }) => {
  286 |     await createProject(page, 'Task rename invalid');
  287 |     await openProject(page, 'Task rename invalid');
  288 |     await createTask(page, 'Kept title');
  289 |     await taskRow(page, 'Kept title').getByRole('textbox', { name: 'New task title', exact: true }).fill('   ');
  290 |     await taskRow(page, 'Kept title').getByRole('button', { name: 'Rename task', exact: true }).click();
  291 |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
```