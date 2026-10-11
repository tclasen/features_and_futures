# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-default.spec.mjs >> 127 every bulk action honors owner default and preserves defaults and nonmatching tasks
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task037-executed02-suite/directory-project-default.spec.mjs:18:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  - 3
+ Received  + 1

- Array [
-   "OwnerBulk37 protected deleted",
- ]
+ Array []

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:60946/directory?owner_default_filter=All&directory_notes_status=All&directory_due_status=All&directory_order=Original&project_scope=Active&filter=Deleted&priority_filter=All&due_from…"
    14 × locator resolved to 0 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f45e1]:
  - heading "Task directory" [level=1] [ref=f45e2]
  - text: 0/0 completed
  - group [ref=f45e4]:
    - button "Complete visible tasks" [disabled] [ref=f45e5]
  - group [ref=f45e7]:
    - button "Reopen visible tasks" [disabled] [ref=f45e8]
  - paragraph [ref=f45e9]: No matching tasks
  - group [ref=f45e11]:
    - button "Delete visible tasks" [disabled] [ref=f45e12]
  - group [ref=f45e14]:
    - button "Restore visible tasks" [disabled] [ref=f45e15]
  - group [ref=f45e17]:
    - generic [ref=f45e18]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f45e19]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f45e20]
  - group [ref=f45e22]:
    - generic [ref=f45e23]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f45e24]
    - button "Save visible due date" [disabled] [ref=f45e25]
  - group [ref=f45e27]:
    - generic [ref=f45e28]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [disabled] [ref=f45e29]
    - button "Save visible notes" [disabled] [ref=f45e30]
  - group [ref=f45e32]:
    - button "Export matching workspace" [ref=f45e33]
  - group [ref=f45e35]:
    - button "Projects" [ref=f45e36]
  - generic [ref=f45e38]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f45e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f45e41]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f45e42]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f45e44]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f45e45]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f45e47]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f45e48]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f45e50]:
    - text: Directory order
    - combobox "Directory order" [ref=f45e51]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f45e53]:
    - text: Project scope
    - combobox "Project scope" [ref=f45e54]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f45e56]:
    - text: Task filter
    - combobox "Task filter" [ref=f45e57]:
      - option "All"
      - option "Open"
      - option "Completed"
      - option "Deleted" [selected]
  - generic [ref=f45e59]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f45e60]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f45e62]:
    - generic [ref=f45e63]:
      - text: Directory search
      - textbox "Directory search" [ref=f45e64]: OwnerBulk37
    - button "Search directory" [ref=f45e65]
  - group [ref=f45e67]:
    - generic [ref=f45e68]:
      - text: Due from
      - textbox "Due from" [ref=f45e69]
    - generic [ref=f45e70]:
      - text: Due through
      - textbox "Due through" [ref=f45e71]
    - button "Apply due range" [ref=f45e72]
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