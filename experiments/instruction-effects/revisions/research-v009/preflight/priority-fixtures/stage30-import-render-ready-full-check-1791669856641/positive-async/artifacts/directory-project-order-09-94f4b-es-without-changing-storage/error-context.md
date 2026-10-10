# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-order.spec.mjs >> 091 project-name ordering folds ASCII keeps stable owner ties and reads current renames without changing storage
- Location: experiments/instruction-effects/revisions/research-v009/preflight/priority-fixtures/final030-import-render-ready-executed-suite/directory-project-order.spec.mjs:38:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f38e1]:
  - heading "task-030 Name order Aardvark" [level=1] [ref=f38e2]
  - group [ref=f38e4]:
    - button "Download project" [ref=f38e5]
  - group [ref=f38e7]:
    - button "Projects" [ref=f38e8]
  - group [ref=f38e10]:
    - generic [ref=f38e11]:
      - text: Task search
      - textbox "Task search" [ref=f38e12]
    - button "Search tasks" [ref=f38e13]
  - group [ref=f38e15]:
    - generic [ref=f38e16]:
      - text: Due from
      - textbox "Due from" [ref=f38e17]
    - generic [ref=f38e18]:
      - text: Due through
      - textbox "Due through" [ref=f38e19]
    - button "Apply due range" [ref=f38e20]
  - group [ref=f38e22]:
    - generic [ref=f38e23]:
      - text: New project name
      - textbox "New project name" [ref=f38e24]
    - button "Rename project" [ref=f38e25]
  - generic [ref=f38e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f38e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f38e30]:
    - generic [ref=f38e31]:
      - text: Task title
      - textbox "Task title" [ref=f38e32]
    - button "Create task" [ref=f38e33]
  - generic [ref=f38e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f38e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f38e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f38e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f38e40]:
    - text: task-030 Name order target zulu stored
    - group [ref=f38e42]:
      - button "Delete task" [ref=f38e43]
    - checkbox "Complete task-030 Name order target zulu stored" [ref=f38e45]
    - group [ref=f38e47]:
      - generic [ref=f38e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f38e49]
      - button "Save notes" [ref=f38e50]
    - group [ref=f38e52]:
      - generic [ref=f38e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f38e54]
      - button "Save due date" [ref=f38e55]
    - group [ref=f38e57]:
      - generic [ref=f38e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f38e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-030 Bulk first owner"
          - option "task-030 Bulk second owner"
          - option "task-030 Bulk protected"
          - option "task-030 Bulk restart first"
          - option "task-030 Bulk restart second"
          - option "task-030 Defaults independent"
          - option "task-030 Defaults inheritance"
          - option "task-030 Defaults renamed"
          - option "task-030 Deletion fields"
          - option "task-030 Deletion target"
          - option "task-030 Deletion order"
          - option "task-030 Deletion restart"
          - option "task-030 Deleted intersections"
          - option "task-030 Bulk position first"
          - option "task-030 Bulk position second"
          - option "task-030 Bulk deletion restart first"
          - option "task-030 Bulk deletion restart holding"
          - option "task-030 Bulk deletion restart second"
          - option "task-030 Bulk delete first owner"
          - option "task-030 Bulk delete second owner"
          - option "task-030 Bulk duplicate owner"
          - option "task-030 Bulk duplicate owner"
          - option "task-030 Date batch first"
          - option "task-030 Date batch second"
          - option "task-030 Date validation first"
          - option "task-030 Date validation second"
          - option "task-030 Due reserved first"
          - option "task-030 Due reserved second"
          - option "task-030 Notes batch first"
          - option "task-030 Notes batch second"
          - option "task-030 Notes limit first"
          - option "task-030 Notes limit second"
          - option "task-030 Notes reserved first"
          - option "task-030 Notes reserved second"
          - option "task-030 Ordering Zulu owner"
          - option "task-030 Ordering Alpha owner"
          - option "task-030 Ordering actions owner"
          - option "task-030 Ordering active guard owner"
          - option "task-030 Ordering Unicode owner"
          - option "task-030 Owner totals zulu first"
          - option "task-030 Owner totals alpha second"
          - option "task-030 Duplicate owner first"
          - option "task-030 Duplicate owner first"
          - option "task-030 Priority reserved first"
          - option "task-030 Priority reserved second"
          - option "task-030 Priority batch first owner"
          - option "task-030 Priority batch second owner"
          - option "task-030 Priority duplicate owner"
          - option "task-030 Priority duplicate owner"
          - option "task-030 Project order reserved first"
          - option "task-030 Project order reserved second"
          - option "task-030 Name order alpha"
          - option "task-030 Name order ALPHA"
      - button "Move task" [ref=f38e60]
    - group [ref=f38e62]:
      - generic [ref=f38e63]:
        - text: New task title
        - textbox "New task title" [ref=f38e64]
      - button "Rename task" [ref=f38e65]
    - generic [ref=f38e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f38e68]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f38e69]:
    - text: task-030 Name order target alpha stored
    - group [ref=f38e71]:
      - button "Delete task" [ref=f38e72]
    - checkbox "Complete task-030 Name order target alpha stored" [ref=f38e74]
    - group [ref=f38e76]:
      - generic [ref=f38e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f38e78]
      - button "Save notes" [ref=f38e79]
    - group [ref=f38e81]:
      - generic [ref=f38e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f38e83]: 2064-02-29
      - button "Save due date" [ref=f38e84]
    - group [ref=f38e86]:
      - generic [ref=f38e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f38e88]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-030 Bulk first owner"
          - option "task-030 Bulk second owner"
          - option "task-030 Bulk protected"
          - option "task-030 Bulk restart first"
          - option "task-030 Bulk restart second"
          - option "task-030 Defaults independent"
          - option "task-030 Defaults inheritance"
          - option "task-030 Defaults renamed"
          - option "task-030 Deletion fields"
          - option "task-030 Deletion target"
          - option "task-030 Deletion order"
          - option "task-030 Deletion restart"
          - option "task-030 Deleted intersections"
          - option "task-030 Bulk position first"
          - option "task-030 Bulk position second"
          - option "task-030 Bulk deletion restart first"
          - option "task-030 Bulk deletion restart holding"
          - option "task-030 Bulk deletion restart second"
          - option "task-030 Bulk delete first owner"
          - option "task-030 Bulk delete second owner"
          - option "task-030 Bulk duplicate owner"
          - option "task-030 Bulk duplicate owner"
          - option "task-030 Date batch first"
          - option "task-030 Date batch second"
          - option "task-030 Date validation first"
          - option "task-030 Date validation second"
          - option "task-030 Due reserved first"
          - option "task-030 Due reserved second"
          - option "task-030 Notes batch first"
          - option "task-030 Notes batch second"
          - option "task-030 Notes limit first"
          - option "task-030 Notes limit second"
          - option "task-030 Notes reserved first"
          - option "task-030 Notes reserved second"
          - option "task-030 Ordering Zulu owner"
          - option "task-030 Ordering Alpha owner"
          - option "task-030 Ordering actions owner"
          - option "task-030 Ordering active guard owner"
          - option "task-030 Ordering Unicode owner"
          - option "task-030 Owner totals zulu first"
          - option "task-030 Owner totals alpha second"
          - option "task-030 Duplicate owner first"
          - option "task-030 Duplicate owner first"
          - option "task-030 Priority reserved first"
          - option "task-030 Priority reserved second"
          - option "task-030 Priority batch first owner"
          - option "task-030 Priority batch second owner"
          - option "task-030 Priority duplicate owner"
          - option "task-030 Priority duplicate owner"
          - option "task-030 Project order reserved first"
          - option "task-030 Project order reserved second"
          - option "task-030 Name order alpha"
          - option "task-030 Name order ALPHA"
      - button "Move task" [ref=f38e89]
    - group [ref=f38e91]:
      - generic [ref=f38e92]:
        - text: New task title
        - textbox "New task title" [ref=f38e93]
      - button "Rename task" [ref=f38e94]
    - generic [ref=f38e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f38e97]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
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
  15 |  await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
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
> 45 |   const renamed='Name order Aardvark';await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(renamed));await page.getByRole('button',{name:'Rename project',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');return projectRow(observer,renamed).count();}).toBe(1);}finally{await observer.close();}
     |                                                                                                                                                                                                                                                                                                                                                                       ^ Error: expect(received).toBe(expected) // Object.is equality
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