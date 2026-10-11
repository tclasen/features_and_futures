# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-prefix-search.spec.mjs >> 130 Starts with matches the whole normalized prefix and preserves other modes filters and order
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task038-executed04-suite/directory-prefix-search.spec.mjs:12:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  -  0
+ Received  + 14

  Array [
+   "First existing",
+   "Position travelling",
+   "First later",
+   "First newly created",
+   "Second existing",
+   "Second newly created",
+   "Imported live",
+   "🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂",
    "Prefix38 Birch38 first",
+   "before Prefix38 Birch38 embedded",
+   "Prefix38 gap Birch38",
+   "Birch38 Prefix38",
+   "Prefix38Birch38 joined",
+   "Prefix38 only",
+   "Neither38",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:61615/directory?owner_default_filter=All&directory_notes_status=All&directory_due_status=All&directory_order=Original&project_scope=Active&filter=All&priority_filter=All&due_from=&du…"
    3 × locator resolved to 0 elements
    11 × locator resolved to 15 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f37e1]:
  - heading "Task directory" [level=1] [ref=f37e2]
  - text: 0/15 completed
  - generic [ref=f37e3]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f37e5]:
      - button "Open project" [ref=f37e6]
  - generic [ref=f37e7]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f37e9]:
      - button "Open project" [ref=f37e10]
  - generic [ref=f37e11]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f37e13]:
      - button "Open project" [ref=f37e14]
  - generic [ref=f37e15]:
    - text: task-032 Legacy title owner0/1 completed
    - group [ref=f37e17]:
      - button "Open project" [ref=f37e18]
  - generic [ref=f37e19]:
    - text: task-038 Prefix modes owner0/7 completed
    - group [ref=f37e21]:
      - button "Open project" [ref=f37e22]
  - group [ref=f37e24]:
    - button "Complete visible tasks" [ref=f37e25]
  - group [ref=f37e27]:
    - button "Reopen visible tasks" [disabled] [ref=f37e28]
  - group [ref=f37e30]:
    - button "Delete visible tasks" [ref=f37e31]
  - group [ref=f37e33]:
    - button "Restore visible tasks" [disabled] [ref=f37e34]
  - group [ref=f37e36]:
    - generic [ref=f37e37]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f37e38]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f37e39]
  - group [ref=f37e41]:
    - generic [ref=f37e42]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f37e43]
    - button "Save visible due date" [ref=f37e44]
  - group [ref=f37e46]:
    - generic [ref=f37e47]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f37e48]
    - button "Save visible notes" [ref=f37e49]
  - group [ref=f37e51]:
    - button "Export matching workspace" [ref=f37e52]
  - group [ref=f37e54]:
    - button "Projects" [ref=f37e55]
  - generic [ref=f37e57]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f37e58]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f37e60]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f37e61]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f37e63]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f37e64]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f37e66]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f37e67]:
      - option "Phrase"
      - option "All words"
      - option "Any words"
      - option "Starts with" [selected]
  - generic [ref=f37e69]:
    - text: Directory order
    - combobox "Directory order" [ref=f37e70]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f37e72]:
    - text: Project scope
    - combobox "Project scope" [ref=f37e73]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f37e75]:
    - text: Task filter
    - combobox "Task filter" [ref=f37e76]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f37e78]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f37e79]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f37e81]:
    - generic [ref=f37e82]:
      - text: Directory search
      - textbox "Directory search" [ref=f37e83]
    - button "Search directory" [ref=f37e84]
  - group [ref=f37e86]:
    - generic [ref=f37e87]:
      - text: Due from
      - textbox "Due from" [ref=f37e88]
    - generic [ref=f37e89]:
      - text: Due through
      - textbox "Due through" [ref=f37e90]
    - button "Apply due range" [ref=f37e91]
  - generic [ref=f37e92]:
    - text: First existingtask-012 Position first ownerOpenNormal
    - group [ref=f37e94]:
      - button "Open project" [ref=f37e95]
  - generic [ref=f37e96]:
    - text: Position travellingtask-012 Position first ownerOpenNormal
    - group [ref=f37e98]:
      - button "Open project" [ref=f37e99]
  - generic [ref=f37e100]:
    - text: First latertask-012 Position first ownerOpenNormal
    - group [ref=f37e102]:
      - button "Open project" [ref=f37e103]
  - generic [ref=f37e104]:
    - text: First newly createdtask-012 Position first ownerOpenNormal
    - group [ref=f37e106]:
      - button "Open project" [ref=f37e107]
  - generic [ref=f37e108]:
    - text: Second existingtask-012 Position second ownerOpenNormal
    - group [ref=f37e110]:
      - button "Open project" [ref=f37e111]
  - generic [ref=f37e112]:
    - text: Second newly createdtask-012 Position second ownerOpenNormal
    - group [ref=f37e114]:
      - button "Open project" [ref=f37e115]
  - generic [ref=f37e116]:
    - text: Imported livetask-018 Import restartOpenLow2044-02-29Live import
    - group [ref=f37e118]:
      - button "Open project" [ref=f37e119]
  - generic [ref=f37e120]:
    - text: 🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂task-032 Legacy title ownerOpenNormal Legacy title Ω kept
    - group [ref=f37e122]:
      - button "Open project" [ref=f37e123]
  - generic [ref=f37e124]:
    - text: Prefix38 Birch38 firsttask-038 Prefix modes ownerOpenNormal3138-03-01
    - group [ref=f37e126]:
      - button "Open project" [ref=f37e127]
  - generic [ref=f37e128]:
    - text: before Prefix38 Birch38 embeddedtask-038 Prefix modes ownerOpenNormal3138-03-01
    - group [ref=f37e130]:
      - button "Open project" [ref=f37e131]
  - generic [ref=f37e132]:
    - text: Prefix38 gap Birch38task-038 Prefix modes ownerOpenNormal3138-03-01
    - group [ref=f37e134]:
      - button "Open project" [ref=f37e135]
  - generic [ref=f37e136]:
    - text: Birch38 Prefix38task-038 Prefix modes ownerOpenNormal3138-03-01
    - group [ref=f37e138]:
      - button "Open project" [ref=f37e139]
  - generic [ref=f37e140]:
    - text: Prefix38Birch38 joinedtask-038 Prefix modes ownerOpenNormal3138-03-01
    - group [ref=f37e142]:
      - button "Open project" [ref=f37e143]
  - generic [ref=f37e144]:
    - text: Prefix38 onlytask-038 Prefix modes ownerOpenNormal3138-03-01
    - group [ref=f37e146]:
      - button "Open project" [ref=f37e147]
  - generic [ref=f37e148]:
    - text: Neither38task-038 Prefix modes ownerOpenNormal3138-03-01Prefix38 Birch38
    - group [ref=f37e150]:
      - button "Open project" [ref=f37e151]
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