# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-notes-status.spec.mjs >> 122 notes presence treats whitespace as present and intersects every directory filter
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task036-executed02-suite/directory-notes-status.spec.mjs:12:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  - 0
+ Received  + 1

  Array [
    "NotesPresence36 empty",
+   "NotesPresence36 whitespace",
    "NotesPresence36 other",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:49230/directory?directory_notes_status=Empty&directory_due_status=All&directory_order=Original&project_scope=Active&filter=All&priority_filter=All&due_from=&due_through=&directory_se…"
    3 × locator resolved to 0 elements
    11 × locator resolved to 3 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f55e1]:
  - heading "Task directory" [level=1] [ref=f55e2]
  - text: 0/3 completed
  - generic [ref=f55e3]:
    - text: task-036 Notes presence first0/2 completed
    - group [ref=f55e5]:
      - button "Open project" [ref=f55e6]
  - generic [ref=f55e7]:
    - text: task-036 Notes presence second0/1 completed
    - group [ref=f55e9]:
      - button "Open project" [ref=f55e10]
  - group [ref=f55e12]:
    - button "Complete visible tasks" [ref=f55e13]
  - group [ref=f55e15]:
    - button "Reopen visible tasks" [disabled] [ref=f55e16]
  - group [ref=f55e18]:
    - button "Delete visible tasks" [ref=f55e19]
  - group [ref=f55e21]:
    - button "Restore visible tasks" [disabled] [ref=f55e22]
  - group [ref=f55e24]:
    - generic [ref=f55e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f55e26]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f55e27]
  - group [ref=f55e29]:
    - generic [ref=f55e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f55e31]
    - button "Save visible due date" [ref=f55e32]
  - group [ref=f55e34]:
    - generic [ref=f55e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f55e36]
    - button "Save visible notes" [ref=f55e37]
  - group [ref=f55e39]:
    - button "Export matching workspace" [ref=f55e40]
  - group [ref=f55e42]:
    - button "Projects" [ref=f55e43]
  - generic [ref=f55e45]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f55e46]:
      - option "All"
      - option "Empty" [selected]
      - option "Present"
  - generic [ref=f55e48]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f55e49]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f55e51]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f55e52]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f55e54]:
    - text: Directory order
    - combobox "Directory order" [ref=f55e55]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f55e57]:
    - text: Project scope
    - combobox "Project scope" [ref=f55e58]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f55e60]:
    - text: Task filter
    - combobox "Task filter" [ref=f55e61]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f55e63]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f55e64]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f55e66]:
    - generic [ref=f55e67]:
      - text: Directory search
      - textbox "Directory search" [ref=f55e68]: NotesPresence36
    - button "Search directory" [ref=f55e69]
  - group [ref=f55e71]:
    - generic [ref=f55e72]:
      - text: Due from
      - textbox "Due from" [ref=f55e73]
    - generic [ref=f55e74]:
      - text: Due through
      - textbox "Due through" [ref=f55e75]
    - button "Apply due range" [ref=f55e76]
  - generic [ref=f55e77]:
    - text: NotesPresence36 emptytask-036 Notes presence firstOpenHigh2936-03-01
    - group [ref=f55e79]:
      - button "Open project" [ref=f55e80]
  - generic [ref=f55e81]:
    - text: NotesPresence36 whitespacetask-036 Notes presence firstOpenNormal
    - group [ref=f55e83]:
      - button "Open project" [ref=f55e84]
  - generic [ref=f55e85]:
    - text: NotesPresence36 othertask-036 Notes presence secondOpenLow2936-03-01
    - group [ref=f55e87]:
      - button "Open project" [ref=f55e88]
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