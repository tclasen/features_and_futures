# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owner-default-edit.spec.mjs >> 140 owner default assignment honors every current filter without changing task priorities
- Location: experiments/instruction-effects/revisions/research-v016/preflight/task040-action-role-suite/directory-owner-default-edit.spec.mjs:25:2

# Error details

```
SyntaxError: Unexpected token '<', "<h1>Task d"... is not valid JSON
```

# Page snapshot

```yaml
- generic [ref=f136e1]:
  - heading "Task directory" [level=1] [ref=f136e2]
  - text: 1/1 completed
  - generic [ref=f136e3]:
    - text: task-040 Default matching1/1 completed
    - group [ref=f136e5]:
      - button "Open project" [ref=f136e6]
  - link "Complete visible tasks" [disabled] [ref=f136e8] [cursor=pointer]:
    - /url: /directory/bulk-complete
  - link "Reopen visible tasks" [ref=f136e10] [cursor=pointer]:
    - /url: /directory/bulk-reopen
  - group [ref=f136e12]:
    - button "Delete visible tasks" [ref=f136e13]
  - group [ref=f136e15]:
    - button "Restore visible tasks" [disabled] [ref=f136e16]
  - group [ref=f136e18]:
    - generic [ref=f136e19]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f136e20]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f136e21]
  - group [ref=f136e23]:
    - generic [ref=f136e24]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f136e25]
    - button "Save visible due date" [ref=f136e26]
  - group [ref=f136e28]:
    - generic [ref=f136e29]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f136e30]
    - button "Save visible notes" [ref=f136e31]
  - generic [ref=f136e32]:
    - generic [ref=f136e33]:
      - text: Visible projects default priority
      - combobox "Visible projects default priority" [ref=f136e34]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - link "Set visible project default" [ref=f136e35] [cursor=pointer]:
      - /url: /directory/owner-default
  - link "Archive visible projects" [ref=f136e37] [cursor=pointer]:
    - /url: /directory/owner-archive
  - link "Restore visible projects" [disabled] [ref=f136e39] [cursor=pointer]:
    - /url: /directory/owner-restore
  - link "Export matching workspace" [active] [ref=f136e40] [cursor=pointer]:
    - /url: /directory/workspace-export?owner_default_filter=Normal&directory_notes_status=Present&directory_due_status=Dated&directory_order=Original&project_scope=Active&filter=Completed&priority_filter=Low&due_from=3280-03-01&due_through=3280-03-01&directory_search=DefaultFilters40&directory_mode=Starts+with
  - group [ref=f136e42]:
    - button "Projects" [ref=f136e43]
  - generic [ref=f136e45]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f136e46]:
      - option "All"
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - generic [ref=f136e48]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f136e49]:
      - option "All"
      - option "Empty"
      - option "Present" [selected]
  - generic [ref=f136e51]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f136e52]:
      - option "All"
      - option "Dated" [selected]
      - option "Undated"
  - generic [ref=f136e54]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f136e55]:
      - option "Phrase"
      - option "All words"
      - option "Any words"
      - option "Starts with" [selected]
  - generic [ref=f136e57]:
    - text: Directory order
    - combobox "Directory order" [ref=f136e58]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f136e60]:
    - text: Project scope
    - combobox "Project scope" [ref=f136e61]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f136e63]:
    - text: Task filter
    - combobox "Task filter" [ref=f136e64]:
      - option "All"
      - option "Open"
      - option "Completed" [selected]
      - option "Deleted"
  - generic [ref=f136e66]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f136e67]:
      - option "All"
      - option "Low" [selected]
      - option "Normal"
      - option "High"
  - generic [ref=f136e68]:
    - generic [ref=f136e69]:
      - text: Directory search
      - textbox "Directory search" [ref=f136e70]: DefaultFilters40
    - link "Search directory" [ref=f136e71] [cursor=pointer]:
      - /url: /directory/search
  - group [ref=f136e73]:
    - generic [ref=f136e74]:
      - text: Due from
      - textbox "Due from" [ref=f136e75]: 3280-03-01
    - generic [ref=f136e76]:
      - text: Due through
      - textbox "Due through" [ref=f136e77]: 3280-03-01
    - button "Apply due range" [ref=f136e78]
  - generic [ref=f136e79]:
    - text: DefaultFilters40 0task-040 Default matchingCompletedLow3280-03-01 Filter Ω kept
    - link "Open project" [ref=f136e81] [cursor=pointer]:
      - /url: /projects/1451/open
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