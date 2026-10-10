# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 040 moving under combined filters retains source range and independent data
- Location: runs/instruction-effects/eval-002/tasks/task-011/suite/move-task.spec.mjs:25:2

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Array [
-   1,
+   0,
    0,
  ]

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=f2e2]:
  - generic [ref=f2e3]:
    - paragraph [ref=f2e4]: WORKBOARD
    - heading "task-011 Filtered transfer source" [level=1] [ref=f2e5]
  - generic [ref=f2e6]:
    - button "Projects" [ref=f2e7] [cursor=pointer]
    - generic [ref=f2e8]:
      - generic [ref=f2e9]: New project name
      - generic [ref=f2e10]:
        - textbox "New project name" [ref=f2e11]
        - button "Rename project" [ref=f2e12] [cursor=pointer]
    - generic [ref=f2e13]: Default task priority
    - combobox "Default task priority" [ref=f2e14]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
    - generic [ref=f2e15]:
      - generic [ref=f2e16]: Task title
      - generic [ref=f2e17]:
        - textbox "Task title" [ref=f2e18]
        - button "Create task" [ref=f2e19] [cursor=pointer]
    - heading "Tasks" [level=2] [ref=f2e20]
    - generic [ref=f2e21]: Task filter
    - combobox "Task filter" [ref=f2e22]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
    - generic [ref=f2e23]: Priority filter
    - combobox "Priority filter" [ref=f2e24]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
    - generic [ref=f2e25]:
      - generic [ref=f2e26]: Due from
      - textbox "Due from" [ref=f2e27]:
        - /placeholder: YYYY-MM-DD
        - text: 2033-01-01
      - generic [ref=f2e28]: Due through
      - textbox "Due through" [ref=f2e29]:
        - /placeholder: YYYY-MM-DD
        - text: 2033-01-01
      - button "Apply due range" [ref=f2e30] [cursor=pointer]
    - generic [ref=f2e31]:
      - generic [ref=f2e32]:
        - checkbox "Complete Filtered first" [ref=f2e33]
        - generic [ref=f2e34]: Filtered first
        - generic [ref=f2e35]:
          - generic [ref=f2e36]: New task title
          - textbox "New task title" [ref=f2e37]
          - button "Rename task" [ref=f2e38] [cursor=pointer]
        - generic [ref=f2e39]: Task priority
        - combobox "Task priority" [ref=f2e40]:
          - option "Low"
          - option "Normal"
          - option "High" [selected]
        - generic [ref=f2e41]:
          - generic [ref=f2e42]: Task due date
          - textbox "Task due date" [ref=f2e43]: 2033-01-01
          - button "Save due date" [ref=f2e44] [cursor=pointer]
        - generic [ref=f2e45]:
          - generic [ref=f2e46]: Destination project
          - combobox "Destination project" [ref=f2e47]:
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
          - button "Move task" [ref=f2e48] [cursor=pointer]
      - generic [ref=f2e49]:
        - checkbox "Complete Filtered last" [ref=f2e50]
        - generic [ref=f2e51]: Filtered last
        - generic [ref=f2e52]:
          - generic [ref=f2e53]: New task title
          - textbox "New task title" [ref=f2e54]
          - button "Rename task" [ref=f2e55] [cursor=pointer]
        - generic [ref=f2e56]: Task priority
        - combobox "Task priority" [ref=f2e57]:
          - option "Low"
          - option "Normal"
          - option "High" [selected]
        - generic [ref=f2e58]:
          - generic [ref=f2e59]: Task due date
          - textbox "Task due date" [ref=f2e60]: 2033-01-01
          - button "Save due date" [ref=f2e61] [cursor=pointer]
        - generic [ref=f2e62]:
          - generic [ref=f2e63]: Destination project
          - combobox "Destination project" [ref=f2e64]:
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
          - button "Move task" [ref=f2e65] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3  | const destination=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Destination project',exact:true});
  4  | const move=(page,title)=>taskRow(page,title).getByRole('button',{name:'Move task',exact:true});
  5  | async function persistedLocation(page,source,target,title){
> 6  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,target);const count=await taskRow(observer,title).count();await observer.goto('/');await openProject(observer,source);return [count,await taskRow(observer,title).count()];},{timeout:5000}).toEqual([1,0]);}finally{await observer.close();}
     |                                                                                                                                                                                                                                                                                                                                 ^ Error: expect(received).toEqual(expected) // deep equality
  7  | }
  8  | async function setDate(page,project,title,value){
  9  |  await taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:'Save due date',exact:true}).click();
  10 |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}
  11 | }
  12 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  13 | if(stage>=11){
  14 |  test('039 moving a task preserves data and destination order without inheriting defaults',async({page})=>{
  15 |   await createProject(page,'Transfer target');await openProject(page,'Transfer target');await createTask(page,'Target first');await createTask(page,'Target second');
  16 |   await page.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:'Low'});
  17 |   const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Transfer target');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');}finally{await observer.close();}
  18 |   await createProject(page,'Transfer source');await openProject(page,'Transfer source');await createTask(page,'Transferred complete');await createTask(page,'Source remaining');
  19 |   await taskRow(page,'Transferred complete').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Transfer source','Transferred complete','High');await page.getByRole('checkbox',{name:'Complete Transferred complete',exact:true}).check();await expectPersistedCompletion(page,'Transfer source','Transferred complete',true);await setDate(page,'Transfer source','Transferred complete','2032-02-29');
  20 |   await destination(page,'Transferred complete').selectOption({label:projectName('Transfer target')});await move(page,'Transferred complete').click();await persistedLocation(page,'Transfer source','Transfer target','Transferred complete');await expect(taskRow(page,'Transferred complete')).toHaveCount(0);await expect(taskRow(page,'Source remaining')).toBeVisible();
  21 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Transfer source').getByTestId('project-summary')).toHaveText('0/1 completed');await expect(projectRow(page,'Transfer target').getByTestId('project-summary')).toHaveText('1/3 completed');await openProject(page,'Transfer target');
  22 |   let rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Target first');expect(rows[1]).toContain('Target second');expect(rows[2]).toContain('Transferred complete');await expect(page.getByRole('checkbox',{name:'Complete Transferred complete',exact:true})).toBeChecked();await expect(taskRow(page,'Transferred complete').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,'Transferred complete').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2032-02-29');
  23 |   await page.reload();await expect(taskRow(page,'Transferred complete')).toBeVisible();
  24 |  });
  25 |  test('040 moving under combined filters retains source range and independent data',async({page})=>{
  26 |   await createProject(page,'Filtered transfer target');await createProject(page,'Filtered transfer source');await openProject(page,'Filtered transfer source');
  27 |   for(const title of ['Filtered first','Filtered moving','Filtered last']){await createTask(page,title);await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Filtered transfer source',title,'High');await setDate(page,'Filtered transfer source',title,'2033-01-01');}
  28 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2033-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2033-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();
  29 |   await destination(page,'Filtered moving').selectOption({label:projectName('Filtered transfer target')});await move(page,'Filtered moving').click();await persistedLocation(page,'Filtered transfer source','Filtered transfer target','Filtered moving');
  30 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2033-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2033-01-01');
  31 |   let rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows).toHaveLength(2);expect(rows[0]).toContain('Filtered first');expect(rows[1]).toContain('Filtered last');
  32 |  });
  33 |  test('041 destination choices use active current project names in creation order',async({page})=>{
  34 |   await createProject(page,'Options first');await createProject(page,'Options hidden');await projectRow(page,'Options hidden').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Options hidden')).toHaveCount(0);await createProject(page,'Options second');await createProject(page,'Options owner');await openProject(page,'Options owner');await createTask(page,'Options task');
  35 |   const names=await destination(page,'Options task').locator('option').allTextContents();expect(names).toContain(projectName('Options first'));expect(names).toContain(projectName('Options second'));expect(names).not.toContain(projectName('Options owner'));expect(names).not.toContain(projectName('Options hidden'));expect(names.indexOf(projectName('Options first'))).toBeLessThan(names.indexOf(projectName('Options second')));
  36 |  });
  37 |  test('042 archived source moves are disabled restoration allows moving an undated task',async({page})=>{
  38 |   await createProject(page,'Read-only transfer target');await createProject(page,'Read-only transfer owner');await openProject(page,'Read-only transfer owner');await createTask(page,'Undated transfer');await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Read-only transfer owner').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Read-only transfer owner')).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Read-only transfer owner');await expect(destination(page,'Undated transfer')).toBeDisabled();await expect(move(page,'Undated transfer')).toBeDisabled();
  39 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Read-only transfer owner').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Read-only transfer owner');await expect(destination(page,'Undated transfer')).toBeEnabled();await expect(move(page,'Undated transfer')).toBeEnabled();await destination(page,'Undated transfer').selectOption({label:projectName('Read-only transfer target')});await move(page,'Undated transfer').click();await persistedLocation(page,'Read-only transfer owner','Read-only transfer target','Undated transfer');await page.goto('/');await openProject(page,'Read-only transfer target');await expect(taskRow(page,'Undated transfer').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('');await expect(taskRow(page,'Undated transfer').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await expect(page.getByRole('checkbox',{name:'Complete Undated transfer',exact:true})).not.toBeChecked();
  40 |   await destination(page,'Undated transfer').selectOption({label:projectName('Read-only transfer owner')});await move(page,'Undated transfer').click();await persistedLocation(page,'Read-only transfer target','Read-only transfer owner','Undated transfer');
  41 |  });
  42 | }
  43 | 
```