# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-default.spec.mjs >> 127 every bulk action honors owner default and preserves defaults and nonmatching tasks
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task037-executed02-suite/directory-project-default.spec.mjs:18:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: ""
Received: "3057-03-01"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f40e1]:
  - heading "Task directory" [level=1] [ref=f40e2]
  - text: 0/1 completed
  - generic [ref=f40e3]:
    - text: task-037 Owner bulk high0/1 completed
    - group [ref=f40e5]:
      - button "Open project" [ref=f40e6]
  - group [ref=f40e8]:
    - button "Complete visible tasks" [ref=f40e9]
  - group [ref=f40e11]:
    - button "Reopen visible tasks" [disabled] [ref=f40e12]
  - group [ref=f40e14]:
    - button "Delete visible tasks" [ref=f40e15]
  - group [ref=f40e17]:
    - button "Restore visible tasks" [disabled] [ref=f40e18]
  - group [ref=f40e20]:
    - generic [ref=f40e21]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f40e22]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f40e23]
  - group [ref=f40e25]:
    - generic [ref=f40e26]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f40e27]
    - button "Save visible due date" [ref=f40e28]
  - group [ref=f40e30]:
    - generic [ref=f40e31]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f40e32]
    - button "Save visible notes" [ref=f40e33]
  - group [ref=f40e35]:
    - button "Export matching workspace" [ref=f40e36]
  - group [ref=f40e38]:
    - button "Projects" [ref=f40e39]
  - generic [ref=f40e41]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f40e42]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f40e44]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f40e45]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f40e47]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f40e48]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f40e50]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f40e51]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f40e53]:
    - text: Directory order
    - combobox "Directory order" [ref=f40e54]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f40e56]:
    - text: Project scope
    - combobox "Project scope" [ref=f40e57]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f40e59]:
    - text: Task filter
    - combobox "Task filter" [ref=f40e60]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f40e62]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f40e63]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f40e65]:
    - generic [ref=f40e66]:
      - text: Directory search
      - textbox "Directory search" [ref=f40e67]: OwnerBulk37
    - button "Search directory" [ref=f40e68]
  - group [ref=f40e70]:
    - generic [ref=f40e71]:
      - text: Due from
      - textbox "Due from" [ref=f40e72]
    - generic [ref=f40e73]:
      - text: Due through
      - textbox "Due through" [ref=f40e74]
    - button "Apply due range" [ref=f40e75]
  - generic [ref=f40e76]:
    - text: OwnerBulk37 targettask-037 Owner bulk highOpenLow3057-03-01
    - group [ref=f40e78]:
      - button "Open project" [ref=f40e79]
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
> 36 | async function fieldStored(p,owner,title,label,value){const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:label,exact:true}).inputValue();}).toBe(value);}finally{await o.close();}}
     |                                                                                                                                                                                                                                        ^ Error: expect(received).toBe(expected) // Object.is equality
  37 | async function protectedWrites(p){for(const label of ['Complete visible tasks','Reopen visible tasks','Delete visible tasks','Set visible priority','Save visible due date','Save visible notes'])await expect(p.getByRole('button',{name:label,exact:true})).toBeDisabled();}
  38 | 
  39 | 
  40 | export {rows,owners,titles,result,directory,returnTo,observed,configured,mode,range,query,download,workspace,fieldStored,protectedWrites};
  41 | 
```