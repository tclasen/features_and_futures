# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owner-default-edit.spec.mjs >> 138 default assignment uses the initial represented owners and preserves all existing tasks and defaults elsewhere
- Location: experiments/instruction-effects/revisions/research-v016/preflight/task040-action-role-suite/directory-owner-default-edit.spec.mjs:19:2

# Error details

```
SyntaxError: Unexpected token '<', "<h1>Task d"... is not valid JSON
```

# Page snapshot

```yaml
- generic [ref=f58e1]:
  - heading "Task directory" [level=1] [ref=f58e2]
  - text: 1/2 completed
  - generic [ref=f58e3]:
    - text: task-040 Default edit first1/1 completed
    - group [ref=f58e5]:
      - button "Open project" [ref=f58e6]
  - generic [ref=f58e7]:
    - text: task-040 Default edit second0/1 completed
    - group [ref=f58e9]:
      - button "Open project" [ref=f58e10]
  - link "Complete visible tasks" [ref=f58e12] [cursor=pointer]:
    - /url: /directory/bulk-complete
  - link "Reopen visible tasks" [ref=f58e14] [cursor=pointer]:
    - /url: /directory/bulk-reopen
  - group [ref=f58e16]:
    - button "Delete visible tasks" [ref=f58e17]
  - group [ref=f58e19]:
    - button "Restore visible tasks" [disabled] [ref=f58e20]
  - group [ref=f58e22]:
    - generic [ref=f58e23]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f58e24]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f58e25]
  - group [ref=f58e27]:
    - generic [ref=f58e28]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f58e29]
    - button "Save visible due date" [ref=f58e30]
  - group [ref=f58e32]:
    - generic [ref=f58e33]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f58e34]
    - button "Save visible notes" [ref=f58e35]
  - generic [ref=f58e36]:
    - generic [ref=f58e37]:
      - text: Visible projects default priority
      - combobox "Visible projects default priority" [ref=f58e38]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - link "Set visible project default" [ref=f58e39] [cursor=pointer]:
      - /url: /directory/owner-default
  - link "Archive visible projects" [ref=f58e41] [cursor=pointer]:
    - /url: /directory/owner-archive
  - link "Restore visible projects" [disabled] [ref=f58e43] [cursor=pointer]:
    - /url: /directory/owner-restore
  - link "Export matching workspace" [active] [ref=f58e44] [cursor=pointer]:
    - /url: /directory/workspace-export?owner_default_filter=Normal&directory_notes_status=All&directory_due_status=All&directory_order=Title&project_scope=Active&filter=All&priority_filter=All&due_from=&due_through=&directory_search=EditDefaults40&directory_mode=Phrase
  - group [ref=f58e46]:
    - button "Projects" [ref=f58e47]
  - generic [ref=f58e49]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f58e50]:
      - option "All"
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - generic [ref=f58e52]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f58e53]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f58e55]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f58e56]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f58e58]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f58e59]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
      - option "Starts with"
  - generic [ref=f58e61]:
    - text: Directory order
    - combobox "Directory order" [ref=f58e62]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f58e64]:
    - text: Project scope
    - combobox "Project scope" [ref=f58e65]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f58e67]:
    - text: Task filter
    - combobox "Task filter" [ref=f58e68]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f58e70]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f58e71]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f58e72]:
    - generic [ref=f58e73]:
      - text: Directory search
      - textbox "Directory search" [ref=f58e74]: EditDefaults40
    - link "Search directory" [ref=f58e75] [cursor=pointer]:
      - /url: /directory/search
  - group [ref=f58e77]:
    - generic [ref=f58e78]:
      - text: Due from
      - textbox "Due from" [ref=f58e79]
    - generic [ref=f58e80]:
      - text: Due through
      - textbox "Due through" [ref=f58e81]
    - button "Apply due range" [ref=f58e82]
  - generic [ref=f58e83]:
    - text: EditDefaults40 Alphatask-040 Default edit secondOpenLow
    - link "Open project" [ref=f58e85] [cursor=pointer]:
      - /url: /projects/1439/open
  - generic [ref=f58e86]:
    - text: EditDefaults40 Zulutask-040 Default edit firstCompletedHigh3260-03-01 Defaults Ω kept
    - link "Open project" [ref=f58e88] [cursor=pointer]:
      - /url: /projects/1436/open
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
  15 | async function directory(p,q,ready){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).or(p.getByRole('link',{name:'Task directory',exact:true})).click();await expect(rows(p).getByTestId('directory-task-title').filter({hasText:ready}).first()).toBeVisible();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).or(p.getByRole('link',{name:'Search directory',exact:true})).click();}
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
  33 | async function query(p,value){await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(value);await p.getByRole('button',{name:'Search directory',exact:true}).or(p.getByRole('link',{name:'Search directory',exact:true})).click();}
  34 | async function download(p){const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download project',exact:true}).or(p.getByRole('link',{name:'Download project',exact:true})).click()]);const s=await d.createReadStream(),chunks=[];for await(const c of s)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8')).project;}
> 35 | async function workspace(p){const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Export matching workspace',exact:true}).or(p.getByRole('link',{name:'Export matching workspace',exact:true})).click()]);const s=await d.createReadStream(),chunks=[];for await(const c of s)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8')).projects;}
     |                                                                                                                                                                                                                                                                                                                                        ^ SyntaxError: Unexpected token '<', "<h1>Task d"... is not valid JSON
  36 | async function fieldStored(p,owner,title,label,value){const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:label,exact:true}).inputValue();}).toBe(value);}finally{await o.close();}}
  37 | async function protectedWrites(p){for(const label of ['Complete visible tasks','Reopen visible tasks','Delete visible tasks','Set visible priority','Save visible due date','Save visible notes'])await expect(p.getByRole('button',{name:label,exact:true})).toBeDisabled();}
  38 | 
  39 | 
  40 | export {rows,owners,titles,result,directory,returnTo,observed,configured,mode,range,query,download,workspace,fieldStored,protectedWrites};
  41 | 
```