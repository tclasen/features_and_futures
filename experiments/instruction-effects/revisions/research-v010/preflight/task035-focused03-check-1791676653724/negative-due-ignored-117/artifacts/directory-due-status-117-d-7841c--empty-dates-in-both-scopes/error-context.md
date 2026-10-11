# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-due-status.spec.mjs >> 117 due presence intersects inclusive ranges and distinguishes empty dates in both scopes
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task035-executed03-suite/directory-due-status.spec.mjs:13:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  - 0
+ Received  + 2

  Array [
    "DuePresence35 dated",
+   "DuePresence35 empty",
    "DuePresence35 later",
+   "DuePresence35 other",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:60445/directory?directory_due_status=Dated&directory_order=Original&project_scope=Active&filter=All&priority_filter=All&due_from=&due_through=&directory_search=DuePresence35&director…"
    3 × locator resolved to 0 elements
    11 × locator resolved to 4 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f37e1]:
  - heading "Task directory" [level=1] [ref=f37e2]
  - text: 1/4 completed
  - generic [ref=f37e3]:
    - text: task-035 Due presence first1/3 completed
    - group [ref=f37e5]:
      - button "Open project" [ref=f37e6]
  - generic [ref=f37e7]:
    - text: task-035 Due presence second0/1 completed
    - group [ref=f37e9]:
      - button "Open project" [ref=f37e10]
  - group [ref=f37e12]:
    - button "Complete visible tasks" [ref=f37e13]
  - group [ref=f37e15]:
    - button "Reopen visible tasks" [ref=f37e16]
  - group [ref=f37e18]:
    - button "Delete visible tasks" [ref=f37e19]
  - group [ref=f37e21]:
    - button "Restore visible tasks" [disabled] [ref=f37e22]
  - group [ref=f37e24]:
    - generic [ref=f37e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f37e26]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f37e27]
  - group [ref=f37e29]:
    - generic [ref=f37e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f37e31]
    - button "Save visible due date" [ref=f37e32]
  - group [ref=f37e34]:
    - generic [ref=f37e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f37e36]
    - button "Save visible notes" [ref=f37e37]
  - group [ref=f37e39]:
    - button "Export matching workspace" [ref=f37e40]
  - group [ref=f37e42]:
    - button "Projects" [ref=f37e43]
  - generic [ref=f37e45]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f37e46]:
      - option "All"
      - option "Dated" [selected]
      - option "Undated"
  - generic [ref=f37e48]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f37e49]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f37e51]:
    - text: Directory order
    - combobox "Directory order" [ref=f37e52]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f37e54]:
    - text: Project scope
    - combobox "Project scope" [ref=f37e55]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f37e57]:
    - text: Task filter
    - combobox "Task filter" [ref=f37e58]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f37e60]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f37e61]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f37e63]:
    - generic [ref=f37e64]:
      - text: Directory search
      - textbox "Directory search" [ref=f37e65]: DuePresence35
    - button "Search directory" [ref=f37e66]
  - group [ref=f37e68]:
    - generic [ref=f37e69]:
      - text: Due from
      - textbox "Due from" [ref=f37e70]
    - generic [ref=f37e71]:
      - text: Due through
      - textbox "Due through" [ref=f37e72]
    - button "Apply due range" [ref=f37e73]
  - generic [ref=f37e74]:
    - text: DuePresence35 datedtask-035 Due presence firstOpenNormal2735-02-28
    - group [ref=f37e76]:
      - button "Open project" [ref=f37e77]
  - generic [ref=f37e78]:
    - text: DuePresence35 emptytask-035 Due presence firstOpenNormal whitespace guard
    - group [ref=f37e80]:
      - button "Open project" [ref=f37e81]
  - generic [ref=f37e82]:
    - text: DuePresence35 latertask-035 Due presence firstCompletedHigh2735-03-01
    - group [ref=f37e84]:
      - button "Open project" [ref=f37e85]
  - generic [ref=f37e86]:
    - text: DuePresence35 othertask-035 Due presence secondOpenNormal
    - group [ref=f37e88]:
      - button "Open project" [ref=f37e89]
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