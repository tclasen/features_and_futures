# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owner-default-edit.spec.mjs >> 138 default assignment uses the initial represented owners and preserves all existing tasks and defaults elsewhere
- Location: experiments/instruction-effects/revisions/research-v011/preflight/task040-executed01-suite/directory-owner-default-edit.spec.mjs:19:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary')
Timeout: 5000ms
- Expected  - 1
+ Received  + 1

  Array [
-   "1/1 completed",
    "0/1 completed",
+   "1/1 completed",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary') with timeout 5000ms
  - waiting for getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary')
    14 × locator resolved to 2 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f56e1]:
  - heading "Task directory" [level=1] [ref=f56e2]
  - text: 1/2 completed
  - generic [ref=f56e3]:
    - text: task-040 Default edit first0/1 completed
    - group [ref=f56e5]:
      - button "Open project" [ref=f56e6]
  - generic [ref=f56e7]:
    - text: task-040 Default edit second1/1 completed
    - group [ref=f56e9]:
      - button "Open project" [ref=f56e10]
  - group [ref=f56e12]:
    - button "Complete visible tasks" [ref=f56e13]
  - group [ref=f56e15]:
    - button "Reopen visible tasks" [ref=f56e16]
  - group [ref=f56e18]:
    - button "Delete visible tasks" [ref=f56e19]
  - group [ref=f56e21]:
    - button "Restore visible tasks" [disabled] [ref=f56e22]
  - group [ref=f56e24]:
    - generic [ref=f56e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f56e26]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f56e27]
  - group [ref=f56e29]:
    - generic [ref=f56e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f56e31]
    - button "Save visible due date" [ref=f56e32]
  - group [ref=f56e34]:
    - generic [ref=f56e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f56e36]
    - button "Save visible notes" [ref=f56e37]
  - group [ref=f56e39]:
    - generic [ref=f56e40]:
      - text: Visible projects default priority
      - combobox "Visible projects default priority" [ref=f56e41]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible project default" [ref=f56e42]
  - group [ref=f56e44]:
    - button "Archive visible projects" [ref=f56e45]
  - group [ref=f56e47]:
    - button "Restore visible projects" [disabled] [ref=f56e48]
  - group [ref=f56e50]:
    - button "Export matching workspace" [ref=f56e51]
  - group [ref=f56e53]:
    - button "Projects" [ref=f56e54]
  - generic [ref=f56e56]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f56e57]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f56e59]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f56e60]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f56e62]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f56e63]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f56e65]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f56e66]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
      - option "Starts with"
  - generic [ref=f56e68]:
    - text: Directory order
    - combobox "Directory order" [ref=f56e69]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f56e71]:
    - text: Project scope
    - combobox "Project scope" [ref=f56e72]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f56e74]:
    - text: Task filter
    - combobox "Task filter" [ref=f56e75]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f56e77]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f56e78]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f56e80]:
    - generic [ref=f56e81]:
      - text: Directory search
      - textbox "Directory search" [ref=f56e82]: EditDefaults40
    - button "Search directory" [ref=f56e83]
  - group [ref=f56e85]:
    - generic [ref=f56e86]:
      - text: Due from
      - textbox "Due from" [ref=f56e87]
    - generic [ref=f56e88]:
      - text: Due through
      - textbox "Due through" [ref=f56e89]
    - button "Apply due range" [ref=f56e90]
  - generic [ref=f56e91]:
    - text: EditDefaults40 Alphatask-040 Default edit secondCompletedLow
    - group [ref=f56e93]:
      - button "Open project" [ref=f56e94]
  - generic [ref=f56e95]:
    - text: EditDefaults40 Zulutask-040 Default edit firstOpenHigh3260-03-01 Defaults Ω kept
    - group [ref=f56e97]:
      - button "Open project" [ref=f56e98]
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
  10 |  await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
  11 |  await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));
> 12 |  await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);
     |                                                                 ^ Error: expect(locator).toHaveText(expected) failed
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