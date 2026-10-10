# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-due-status.spec.mjs >> 119 presence summaries and matching export keep duplicate imported owners separate and remain read-only
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task035-executed-suite/directory-due-status.spec.mjs:41:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  -  0
+ Received  + 15

  Array [
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "Memory kept",
+   "DuePresence35 archived",
+   "ZirconDue35 gap AmberDue35 archived",
    "DueDuplicate35 archived",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    3 × locator resolved to 19 elements
    11 × locator resolved to 16 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f6e1]:
  - heading "Task directory" [level=1] [ref=f6e2]
  - text: 13/16 completed
  - generic [ref=f6e3]:
    - text: task-005 Persistence renamed1/1 completed
    - group [ref=f6e5]:
      - button "Open project" [ref=f6e6]
  - generic [ref=f6e7]:
    - text: task-007 Persistence renamed1/1 completed
    - group [ref=f6e9]:
      - button "Open project" [ref=f6e10]
  - generic [ref=f6e11]:
    - text: task-008 Persistence renamed1/1 completed
    - group [ref=f6e13]:
      - button "Open project" [ref=f6e14]
  - generic [ref=f6e15]:
    - text: task-009 Persistence renamed1/1 completed
    - group [ref=f6e17]:
      - button "Open project" [ref=f6e18]
  - generic [ref=f6e19]:
    - text: task-010 Persistence renamed1/1 completed
    - group [ref=f6e21]:
      - button "Open project" [ref=f6e22]
  - generic [ref=f6e23]:
    - text: task-011 Persistence renamed1/1 completed
    - group [ref=f6e25]:
      - button "Open project" [ref=f6e26]
  - generic [ref=f6e27]:
    - text: task-012 Persistence renamed1/1 completed
    - group [ref=f6e29]:
      - button "Open project" [ref=f6e30]
  - generic [ref=f6e31]:
    - text: task-013 Persistence renamed1/1 completed
    - group [ref=f6e33]:
      - button "Open project" [ref=f6e34]
  - generic [ref=f6e35]:
    - text: task-014 Persistence renamed1/1 completed
    - group [ref=f6e37]:
      - button "Open project" [ref=f6e38]
  - generic [ref=f6e39]:
    - text: task-018 Persistence renamed1/1 completed
    - group [ref=f6e41]:
      - button "Open project" [ref=f6e42]
  - generic [ref=f6e43]:
    - text: task-017 Persistence renamed1/1 completed
    - group [ref=f6e45]:
      - button "Open project" [ref=f6e46]
  - generic [ref=f6e47]:
    - text: task-016 Persistence renamed1/1 completed
    - group [ref=f6e49]:
      - button "Open project" [ref=f6e50]
  - generic [ref=f6e51]:
    - text: task-015 Persistence renamed1/1 completed
    - group [ref=f6e53]:
      - button "Open project" [ref=f6e54]
  - generic [ref=f6e55]:
    - text: task-035 Due presence archived0/1 completed
    - group [ref=f6e57]:
      - button "Open project" [ref=f6e58]
  - generic [ref=f6e59]:
    - text: task-035 Due bulk archived0/1 completed
    - group [ref=f6e61]:
      - button "Open project" [ref=f6e62]
  - generic [ref=f6e63]:
    - text: task-035 Due duplicate owner0/1 completed
    - group [ref=f6e65]:
      - button "Open project" [ref=f6e66]
  - group [ref=f6e68]:
    - button "Complete visible tasks" [disabled] [ref=f6e69]
  - group [ref=f6e71]:
    - button "Reopen visible tasks" [disabled] [ref=f6e72]
  - group [ref=f6e74]:
    - button "Delete visible tasks" [disabled] [ref=f6e75]
  - group [ref=f6e77]:
    - button "Restore visible tasks" [disabled] [ref=f6e78]
  - group [ref=f6e80]:
    - generic [ref=f6e81]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f6e82]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f6e83]
  - group [ref=f6e85]:
    - generic [ref=f6e86]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f6e87]
    - button "Save visible due date" [disabled] [ref=f6e88]
  - group [ref=f6e90]:
    - generic [ref=f6e91]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [disabled] [ref=f6e92]
    - button "Save visible notes" [disabled] [ref=f6e93]
  - group [ref=f6e95]:
    - button "Export matching workspace" [ref=f6e96]
  - group [ref=f6e98]:
    - button "Projects" [ref=f6e99]
  - generic [ref=f6e101]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f6e102]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f6e104]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f6e105]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f6e107]:
    - text: Directory order
    - combobox "Directory order" [ref=f6e108]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f6e110]:
    - text: Project scope
    - combobox "Project scope" [ref=f6e111]:
      - option "Active"
      - option "Archived" [selected]
  - generic [ref=f6e113]:
    - text: Task filter
    - combobox "Task filter" [ref=f6e114]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f6e116]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f6e117]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f6e119]:
    - generic [ref=f6e120]:
      - text: Directory search
      - textbox "Directory search" [ref=f6e121]
    - button "Search directory" [ref=f6e122]
  - group [ref=f6e124]:
    - generic [ref=f6e125]:
      - text: Due from
      - textbox "Due from" [ref=f6e126]
    - generic [ref=f6e127]:
      - text: Due through
      - textbox "Due through" [ref=f6e128]
    - button "Apply due range" [ref=f6e129]
  - generic [ref=f6e130]:
    - text: Memory kepttask-005 Persistence renamedCompletedNormal
    - group [ref=f6e132]:
      - button "Open project" [ref=f6e133]
  - generic [ref=f6e134]:
    - text: Memory kepttask-007 Persistence renamedCompletedHigh
    - group [ref=f6e136]:
      - button "Open project" [ref=f6e137]
  - generic [ref=f6e138]:
    - text: Memory kepttask-008 Persistence renamedCompletedHigh
    - group [ref=f6e140]:
      - button "Open project" [ref=f6e141]
  - generic [ref=f6e142]:
    - text: Memory kepttask-009 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e144]:
      - button "Open project" [ref=f6e145]
  - generic [ref=f6e146]:
    - text: Memory kepttask-010 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e148]:
      - button "Open project" [ref=f6e149]
  - generic [ref=f6e150]:
    - text: Memory kepttask-011 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e152]:
      - button "Open project" [ref=f6e153]
  - generic [ref=f6e154]:
    - text: Memory kepttask-012 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e156]:
      - button "Open project" [ref=f6e157]
  - generic [ref=f6e158]:
    - text: Memory kepttask-013 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e160]:
      - button "Open project" [ref=f6e161]
  - generic [ref=f6e162]:
    - text: Memory kepttask-014 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e164]:
      - button "Open project" [ref=f6e165]
  - generic [ref=f6e166]:
    - text: Memory kepttask-018 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e168]:
      - button "Open project" [ref=f6e169]
  - generic [ref=f6e170]:
    - text: Memory kepttask-017 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e172]:
      - button "Open project" [ref=f6e173]
  - generic [ref=f6e174]:
    - text: Memory kepttask-016 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e176]:
      - button "Open project" [ref=f6e177]
  - generic [ref=f6e178]:
    - text: Memory kepttask-015 Persistence renamedCompletedHigh2028-02-29
    - group [ref=f6e180]:
      - button "Open project" [ref=f6e181]
  - generic [ref=f6e182]:
    - text: DuePresence35 archivedtask-035 Due presence archivedOpenNormal2735-02-28
    - group [ref=f6e184]:
      - button "Open project" [ref=f6e185]
  - generic [ref=f6e186]:
    - text: ZirconDue35 gap AmberDue35 archivedtask-035 Due bulk archivedOpenHigh2785-02-28 Due original Ω kept
    - group [ref=f6e188]:
      - button "Open project" [ref=f6e189]
  - generic [ref=f6e190]:
    - text: DueDuplicate35 archivedtask-035 Due duplicate ownerOpenHigh2815-02-28Archived original
    - group [ref=f6e192]:
      - button "Open project" [ref=f6e193]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
  4  | const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
  5  | const save=p=>p.getByRole('button',{name:'Set visible priority',exact:true});
  6  | const restore=p=>p.getByRole('button',{name:'Restore visible tasks',exact:true});
  7  | async function titles(p,expected){const r=p.getByTestId('task-row').filter({visible:true});await expect(r).toHaveCount(expected.length);for(const [i,title] of expected.entries())await expect(r.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  8  | async function result(p,names,counts,expected,total){
  9  |  if(!expected.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();
> 10 |  await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
     |                                                            ^ Error: expect(locator).toHaveText(expected) failed
  11 |  await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));
  12 |  await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);
  13 |  await expect(p.getByTestId('directory-summary')).toHaveText(total);
  14 | }
  15 | async function directory(p,q,ready){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await expect(rows(p).getByTestId('directory-task-title').filter({hasText:ready}).first()).toBeVisible();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
  16 | async function returnTo(p,owner){await p.goto('/');await openProject(p,owner);}
  17 | async function observed(p,owner,title,field,value){
  18 |  const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:field,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await o.close();}
  19 |  await returnTo(p,owner);
  20 | }
  21 | async function configured(p,owner,title,{priority='Normal',date='',completed=false,deleted=false,notes=''}={}){
  22 |  await createTask(p,title);
  23 |  if(priority!=='Normal'){await taskRow(p,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:priority});await expectPersistedPriority(p,owner,title,priority);await returnTo(p,owner);}
  24 |  if(date){await taskRow(p,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(date);await taskRow(p,title).getByRole('button',{name:'Save due date',exact:true}).click();await observed(p,owner,title,'Task due date',date);}
  25 |  if(notes){await taskRow(p,title).getByRole('textbox',{name:'Task notes',exact:true}).fill(notes);await taskRow(p,title).getByRole('button',{name:'Save notes',exact:true}).click();await observed(p,owner,title,'Task notes',notes);}
  26 |  if(completed){await p.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await expectPersistedCompletion(p,owner,title,true);await returnTo(p,owner);}
  27 |  if(deleted){await taskRow(p,title).getByRole('button',{name:'Delete task',exact:true}).click();const o=await p.context().newPage();try{await returnTo(o,owner);await o.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(o,title)).toBeVisible();}finally{await o.close();}await returnTo(p,owner);}
  28 | }
  29 | 
  30 | 
  31 | const mode=p=>p.getByRole('combobox',{name:'Directory search mode',exact:true});
  32 | async function range(p,date){await p.getByRole('textbox',{name:'Due from',exact:true}).fill(date);await p.getByRole('textbox',{name:'Due through',exact:true}).fill(date);await p.getByRole('button',{name:'Apply due range',exact:true}).click();}
  33 | async function query(p,value){await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(value);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
  34 | async function download(p){const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download project',exact:true}).click()]);const s=await d.createReadStream(),chunks=[];for await(const c of s)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8')).project;}
  35 | async function workspace(p){const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Export matching workspace',exact:true}).click()]);const s=await d.createReadStream(),chunks=[];for await(const c of s)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8')).projects;}
  36 | async function fieldStored(p,owner,title,label,value){const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:label,exact:true}).inputValue();}).toBe(value);}finally{await o.close();}}
  37 | async function protectedWrites(p){for(const label of ['Complete visible tasks','Reopen visible tasks','Delete visible tasks','Set visible priority','Save visible due date','Save visible notes'])await expect(p.getByRole('button',{name:label,exact:true})).toBeDisabled();}
  38 | 
  39 | 
  40 | export {rows,owners,titles,result,directory,returnTo,observed,configured,mode,range,query,download,workspace,fieldStored,protectedWrites};
  41 | 
```