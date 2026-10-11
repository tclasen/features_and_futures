# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-default.spec.mjs >> 126 owner default differs from task priority and intersects notes dates completion and archived scope
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task037-executed02-suite/directory-project-default.spec.mjs:11:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  - 0
+ Received  + 1

  Array [
+   "Imported live",
    "OwnerDefault37 other low",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:60946/directory?owner_default_filter=High&directory_notes_status=All&directory_due_status=All&directory_order=Original&project_scope=Active&filter=All&priority_filter=Low&due_from=&d…"
    3 × locator resolved to 0 elements
    11 × locator resolved to 2 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f70e1]:
  - heading "Task directory" [level=1] [ref=f70e2]
  - text: 0/2 completed
  - generic [ref=f70e3]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f70e5]:
      - button "Open project" [ref=f70e6]
  - generic [ref=f70e7]:
    - text: task-037 Owner high second0/1 completed
    - group [ref=f70e9]:
      - button "Open project" [ref=f70e10]
  - group [ref=f70e12]:
    - button "Complete visible tasks" [ref=f70e13]
  - group [ref=f70e15]:
    - button "Reopen visible tasks" [disabled] [ref=f70e16]
  - group [ref=f70e18]:
    - button "Delete visible tasks" [ref=f70e19]
  - group [ref=f70e21]:
    - button "Restore visible tasks" [disabled] [ref=f70e22]
  - group [ref=f70e24]:
    - generic [ref=f70e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f70e26]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f70e27]
  - group [ref=f70e29]:
    - generic [ref=f70e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f70e31]
    - button "Save visible due date" [ref=f70e32]
  - group [ref=f70e34]:
    - generic [ref=f70e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f70e36]
    - button "Save visible notes" [ref=f70e37]
  - group [ref=f70e39]:
    - button "Export matching workspace" [ref=f70e40]
  - group [ref=f70e42]:
    - button "Projects" [ref=f70e43]
  - generic [ref=f70e45]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f70e46]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f70e48]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f70e49]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f70e51]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f70e52]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f70e54]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f70e55]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f70e57]:
    - text: Directory order
    - combobox "Directory order" [ref=f70e58]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f70e60]:
    - text: Project scope
    - combobox "Project scope" [ref=f70e61]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f70e63]:
    - text: Task filter
    - combobox "Task filter" [ref=f70e64]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f70e66]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f70e67]:
      - option "All"
      - option "Low" [selected]
      - option "Normal"
      - option "High"
  - group [ref=f70e69]:
    - generic [ref=f70e70]:
      - text: Directory search
      - textbox "Directory search" [ref=f70e71]
    - button "Search directory" [ref=f70e72]
  - group [ref=f70e74]:
    - generic [ref=f70e75]:
      - text: Due from
      - textbox "Due from" [ref=f70e76]
    - generic [ref=f70e77]:
      - text: Due through
      - textbox "Due through" [ref=f70e78]
    - button "Apply due range" [ref=f70e79]
  - generic [ref=f70e80]:
    - text: Imported livetask-018 Import restartOpenLow2044-02-29Live import
    - group [ref=f70e82]:
      - button "Open project" [ref=f70e83]
  - generic [ref=f70e84]:
    - text: OwnerDefault37 other lowtask-037 Owner high secondOpenLow3037-03-01
    - group [ref=f70e86]:
      - button "Open project" [ref=f70e87]
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