# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-order.spec.mjs >> 091 project-name ordering folds ASCII keeps stable owner ties and reads current renames without changing storage
- Location: experiments/instruction-effects/revisions/research-v009/preflight/priority-fixtures/final030-root-readiness02-executed-suite/directory-project-order.spec.mjs:38:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  - 1
+ Received  + 1

  Array [
+   "task-030 Name order target third",
    "task-030 Name order target second zulu",
    "task-030 Name order target second alpha",
-   "task-030 Name order target third",
    "task-030 Name order target zulu stored",
    "task-030 Name order target alpha stored",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:51467/directory?directory_order=Project+name&project_scope=Active&filter=All&priority_filter=All&due_from=&due_through=&directory_search=task-030+Name+order+target&directory_order_ne…"
    3 × locator resolved to 0 elements
    11 × locator resolved to 5 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f38e1]:
  - heading "Task directory" [level=1] [ref=f38e2]
  - text: 0/5 completed
  - generic [ref=f38e3]:
    - text: task-030 Name order Zulu0/2 completed
    - group [ref=f38e5]:
      - button "Open project" [ref=f38e6]
  - generic [ref=f38e7]:
    - text: task-030 Name order alpha0/2 completed
    - group [ref=f38e9]:
      - button "Open project" [ref=f38e10]
  - generic [ref=f38e11]:
    - text: task-030 Name order ALPHA0/1 completed
    - group [ref=f38e13]:
      - button "Open project" [ref=f38e14]
  - group [ref=f38e16]:
    - button "Complete visible tasks" [ref=f38e17]
  - group [ref=f38e19]:
    - button "Reopen visible tasks" [disabled] [ref=f38e20]
  - group [ref=f38e22]:
    - button "Delete visible tasks" [ref=f38e23]
  - group [ref=f38e25]:
    - button "Restore visible tasks" [disabled] [ref=f38e26]
  - group [ref=f38e28]:
    - generic [ref=f38e29]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f38e30]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f38e31]
  - group [ref=f38e33]:
    - generic [ref=f38e34]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f38e35]
    - button "Save visible due date" [ref=f38e36]
  - group [ref=f38e38]:
    - generic [ref=f38e39]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f38e40]
    - button "Save visible notes" [ref=f38e41]
  - group [ref=f38e43]:
    - button "Export matching workspace" [ref=f38e44]
  - group [ref=f38e46]:
    - button "Projects" [ref=f38e47]
  - generic [ref=f38e49]:
    - text: Directory order
    - combobox "Directory order" [ref=f38e50]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name" [selected]
  - generic [ref=f38e52]:
    - text: Project scope
    - combobox "Project scope" [ref=f38e53]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f38e55]:
    - text: Task filter
    - combobox "Task filter" [ref=f38e56]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f38e58]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f38e59]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f38e61]:
    - generic [ref=f38e62]:
      - text: Directory search
      - textbox "Directory search" [ref=f38e63]: task-030 Name order target
    - button "Search directory" [ref=f38e64]
  - group [ref=f38e66]:
    - generic [ref=f38e67]:
      - text: Due from
      - textbox "Due from" [ref=f38e68]
    - generic [ref=f38e69]:
      - text: Due through
      - textbox "Due through" [ref=f38e70]
    - button "Apply due range" [ref=f38e71]
  - generic [ref=f38e72]:
    - text: task-030 Name order target thirdtask-030 Name order ALPHAOpenHigh2064-02-29
    - group [ref=f38e74]:
      - button "Open project" [ref=f38e75]
  - generic [ref=f38e76]:
    - text: task-030 Name order target second zulutask-030 Name order alphaOpenLow
    - group [ref=f38e78]:
      - button "Open project" [ref=f38e79]
  - generic [ref=f38e80]:
    - text: task-030 Name order target second alphatask-030 Name order alphaOpenHigh2064-03-01
    - group [ref=f38e82]:
      - button "Open project" [ref=f38e83]
  - generic [ref=f38e84]:
    - text: task-030 Name order target zulu storedtask-030 Name order ZuluOpenNormal
    - group [ref=f38e86]:
      - button "Open project" [ref=f38e87]
  - generic [ref=f38e88]:
    - text: task-030 Name order target alpha storedtask-030 Name order ZuluOpenHigh2064-02-29
    - group [ref=f38e90]:
      - button "Open project" [ref=f38e91]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow as ordinaryProjectRow,taskRow,createTask,isolateBrowser} from './helpers.mjs';
  3  | // Preserve literal case when exercising intentionally case-folded owner ties.
  4  | const projectRow=(page,label)=>ordinaryProjectRow(page,label).filter({hasText:new RegExp(projectName(label).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))});
  5  | async function createProject(page,label){await page.goto('/');await page.getByRole('textbox',{name:'Project name',exact:true}).fill(projectName(label));await page.getByRole('button',{name:'Create project',exact:true}).click();await expect(projectRow(page,label)).toBeVisible();}
  6  | async function openProject(page,label){await projectRow(page,label).getByRole('button',{name:'Open project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName(label),exact:true}).first()).toBeVisible();}
  7  | 
  8  | const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
  9  | const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
  10 | const save=p=>p.getByRole('button',{name:'Set visible priority',exact:true});
  11 | const restore=p=>p.getByRole('button',{name:'Restore visible tasks',exact:true});
  12 | async function titles(p,expected){const r=p.getByTestId('task-row').filter({visible:true});await expect(r).toHaveCount(expected.length);for(const [i,title] of expected.entries())await expect(r.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  13 | async function result(p,names,counts,expected,total){
  14 |  if(!expected.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();
> 15 |  await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
     |                                                            ^ Error: expect(locator).toHaveText(expected) failed
  16 |  await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));
  17 |  await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);
  18 |  await expect(p.getByTestId('directory-summary')).toHaveText(total);
  19 | }
  20 | async function directory(p,q){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
  21 | async function returnTo(p,owner){await p.goto('/');await openProject(p,owner);}
  22 | async function observed(p,owner,title,field,value){
  23 |  const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:field,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await o.close();}
  24 |  await returnTo(p,owner);
  25 | }
  26 | async function configured(p,owner,title,{priority='Normal',date='',completed=false,deleted=false,notes=''}={}){
  27 |  await createTask(p,title);
  28 |  if(priority!=='Normal'){await taskRow(p,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:priority});await expectPersistedPriority(p,owner,title,priority);await returnTo(p,owner);}
  29 |  if(date){await taskRow(p,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(date);await taskRow(p,title).getByRole('button',{name:'Save due date',exact:true}).click();await observed(p,owner,title,'Task due date',date);}
  30 |  if(notes){await taskRow(p,title).getByRole('textbox',{name:'Task notes',exact:true}).fill(notes);await taskRow(p,title).getByRole('button',{name:'Save notes',exact:true}).click();await observed(p,owner,title,'Task notes',notes);}
  31 |  if(completed){await p.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await expectPersistedCompletion(p,owner,title,true);await returnTo(p,owner);}
  32 |  if(deleted){await taskRow(p,title).getByRole('button',{name:'Delete task',exact:true}).click();const o=await p.context().newPage();try{await returnTo(o,owner);await o.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(o,title)).toBeVisible();}finally{await o.close();}await returnTo(p,owner);}
  33 | }
  34 | 
  35 | 
  36 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  37 | if(stage>=28){
  38 |  test('091 project-name ordering folds ASCII keeps stable owner ties and reads current renames without changing storage',async({page})=>{
  39 |   test.setTimeout(90000);const a='Name order Zulu',b='Name order alpha',c='Name order ALPHA',q=projectName('Name order target'),az=q+' zulu stored',aa=q+' alpha stored',bz=q+' second zulu',ba=q+' second alpha',cz=q+' third';
  40 |   for(const [owner,titles] of [[a,[az,aa]],[b,[bz,ba]],[c,[cz]]]){await createProject(page,owner);await openProject(page,owner);for(const title of titles)await configured(page,owner,title,[aa,ba,cz].includes(title)?{priority:'High',date:title===ba?'2064-03-01':'2064-02-29'}:{priority:title===bz?'Low':'Normal'});}
  41 |   await directory(page,q);await result(page,[a,b,c],['0/2 completed','0/2 completed','0/1 completed'],[az,aa,bz,ba,cz],'0/5 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Project name'});await result(page,[a,b,c],['0/2 completed','0/2 completed','0/1 completed'],[bz,ba,cz,az,aa],'0/5 completed');await expect(rows(page).getByTestId('directory-project-name')).toHaveText([b,b,c,a,a].map(projectName));
  42 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b,c],['0/1 completed','0/1 completed','0/1 completed'],[ba,cz,aa],'0/3 completed');await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2064-02-29');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2064-02-29');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,c],['0/1 completed','0/1 completed'],[cz,aa],'0/2 completed');await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText('Project name');await page.getByRole('textbox',{name:'Due from',exact:true}).fill('');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b,c],['0/1 completed','0/1 completed','0/1 completed'],[ba,cz,aa],'0/3 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});await result(page,[a,b,c],['0/2 completed','0/2 completed','0/1 completed'],[bz,ba,cz,az,aa],'0/5 completed');
  43 | 
  44 |   await rows(page).last().getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[az,aa]);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project',exact:true}).click();const stream=await(await pending).createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);expect(JSON.parse(Buffer.concat(chunks).toString('utf8')).project.tasks.map(t=>t.title)).toEqual([az,aa]);
  45 |   const renamed='Name order Aardvark';await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(renamed));await page.getByRole('button',{name:'Rename project',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await expect(projectRow(observer,renamed).first()).toBeVisible();return projectRow(observer,renamed).count();}).toBe(1);}finally{await observer.close();}
  46 |   await directory(page,q);await result(page,[renamed,b,c],['0/2 completed','0/2 completed','0/1 completed'],[az,aa,bz,ba,cz],'0/5 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Project name'});await result(page,[renamed,b,c],['0/2 completed','0/2 completed','0/1 completed'],[az,aa,bz,ba,cz],'0/5 completed');await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'High'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await result(page,[renamed,b,c],['0/2 completed','0/2 completed','0/1 completed'],[az,aa,bz,ba,cz],'0/5 completed');await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText('Project name');
  47 |  });
  48 |  test('092 project-name ordering compares Unicode code points and literal spacing across protected scope',async({page})=>{
  49 |   test.setTimeout(90000);const names=['Name Unicode å','Name Unicode Å','Name Unicode 🙂','Name Unicode \uE000','Name Unicode gap task','Name Unicode gap  task'],q=projectName('Name Unicode target'),tasks=names.map((_,i)=>q+' '+i);
  50 |   for(const [i,owner] of names.entries()){await createProject(page,owner);await openProject(page,owner);await configured(page,owner,tasks[i],{priority:'High',date:'2064-02-29',deleted:true});await page.goto('/');await projectRow(page,owner).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,owner)).toHaveCount(0);}
  51 |   await directory(page,q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,names,names.map(()=>'0/1 completed'),tasks,'0/6 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Project name'});await expect.poll(async()=>{try{return await rows(page).getByTestId('directory-task-title').allTextContents();}catch(e){if(e.message.includes('Execution context was destroyed'))return null;throw e;}}).toEqual([tasks[5],tasks[4],tasks[1],tasks[0],tasks[3],tasks[2]]);await expect(owners(page).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));await expect(page.getByRole('button',{name:'Set visible priority',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Delete visible tasks',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Restore visible tasks',exact:true})).toBeDisabled();await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Original'});await result(page,names,names.map(()=>'0/1 completed'),tasks,'0/6 completed');
  52 |  });
  53 | }
  54 | 
  55 | async function expectPersistedCompletion(page, project, title, completed) {
  56 |   const observer = await page.context().newPage();
  57 |   try {
  58 |     await expect.poll(async () => {
  59 |       await observer.goto('/');
  60 |       await openProject(observer, project);
  61 |       await observer.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'All'});
  62 |       await expect(taskRow(observer, title)).toBeVisible();
  63 |       return observer.getByRole('checkbox', {name:'Complete '+title, exact:true}).isChecked();
  64 |     }, {timeout:5000, message:'Completion state must be durable before the next navigation'}).toBe(completed);
  65 |   } finally { await observer.close(); }
  66 | }
  67 | 
  68 | async function expectPersistedPriority(page, project, title, priority) {
  69 |   const observer = await page.context().newPage();
  70 |   try {
  71 |     await expect.poll(async () => {
  72 |       await observer.goto('/');
  73 |       await openProject(observer, project);
  74 |       await observer.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'All'});
  75 |       return taskRow(observer, title).getByRole('combobox', {name:'Task priority', exact:true}).locator('option:checked').textContent();
  76 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
  77 |   } finally { await observer.close(); }
  78 | }
  79 | 
```