# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-due-status.spec.mjs >> 121 every directory bulk operation applies due presence without relying on a date range
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task035-executed04-suite/directory-due-status.spec.mjs:59:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-due-date')
Timeout: 5000ms
- Expected  - 0
+ Received  + 1

  Array [
    "2885-03-01",
+   "2885-03-01",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-due-date') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-due-date')
    3 × locator resolved to 0 elements
    11 × locator resolved to 2 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f40e1]:
  - heading "Task directory" [level=1] [ref=f40e2]
  - text: 1/2 completed
  - generic [ref=f40e3]:
    - text: task-035 Due independent bulk1/2 completed
    - group [ref=f40e5]:
      - button "Open project" [ref=f40e6]
  - group [ref=f40e8]:
    - button "Complete visible tasks" [ref=f40e9]
  - group [ref=f40e11]:
    - button "Reopen visible tasks" [ref=f40e12]
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
    - text: Directory due status
    - combobox "Directory due status" [ref=f40e42]:
      - option "All"
      - option "Dated" [selected]
      - option "Undated"
  - generic [ref=f40e44]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f40e45]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f40e47]:
    - text: Directory order
    - combobox "Directory order" [ref=f40e48]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f40e50]:
    - text: Project scope
    - combobox "Project scope" [ref=f40e51]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f40e53]:
    - text: Task filter
    - combobox "Task filter" [ref=f40e54]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f40e56]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f40e57]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f40e59]:
    - generic [ref=f40e60]:
      - text: Directory search
      - textbox "Directory search" [ref=f40e61]: DueIndependent35
    - button "Search directory" [ref=f40e62]
  - group [ref=f40e64]:
    - generic [ref=f40e65]:
      - text: Due from
      - textbox "Due from" [ref=f40e66]
    - generic [ref=f40e67]:
      - text: Due through
      - textbox "Due through" [ref=f40e68]
    - button "Apply due range" [ref=f40e69]
  - generic [ref=f40e70]:
    - text: DueIndependent35 datedtask-035 Due independent bulkOpenLow2885-03-01 Dated original Ω kept
    - group [ref=f40e72]:
      - button "Open project" [ref=f40e73]
  - generic [ref=f40e74]:
    - text: DueIndependent35 emptytask-035 Due independent bulkCompletedHigh2885-03-01Empty original
    - group [ref=f40e76]:
      - button "Open project" [ref=f40e77]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | import {rows,owners,titles,result,directory,returnTo,configured,mode,range,query,download,workspace,fieldStored,protectedWrites} from './directory-presence-helpers.mjs';
  4  | const status=p=>p.getByRole('combobox',{name:'Directory due status',exact:true});
  5  | async function bounds(p,from,through){await p.getByRole('textbox',{name:'Due from',exact:true}).fill(from);await p.getByRole('textbox',{name:'Due through',exact:true}).fill(through);await p.getByRole('button',{name:'Apply due range',exact:true}).click();}
  6  | async function controls(p,{q,due,priority='All',order='Original',word='Phrase',from='',through=''}){
  7  |  await expect(p.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q);
  8  |  for(const [name,value] of [['Directory due status',due],['Priority filter',priority],['Directory order',order],['Directory search mode',word]])await expect(p.getByRole('combobox',{name,exact:true}).locator('option:checked')).toHaveText(value);
  9  |  await expect(p.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue(from);await expect(p.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue(through);
  10 | }
  11 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  12 | if(stage>=35){
  13 |  test('117 due presence intersects inclusive ranges and distinguishes empty dates in both scopes',async({page})=>{
  14 |   test.setTimeout(120000);const a='Due presence first',b='Due presence second',c='Due presence archived',q='DuePresence'+stage,date=String(2700+stage)+'-02-28',later=String(2700+stage)+'-03-01';
  15 |   const dated=q+' dated',empty=q+' empty',late=q+' later',other=q+' other',archived=q+' archived';
  16 |   await createProject(page,a);await openProject(page,a);await configured(page,a,dated,{date});await configured(page,a,empty,{notes:'  whitespace guard  '});await configured(page,a,late,{date:later,priority:'High',completed:true});
  17 |   await createProject(page,b);await openProject(page,b);await createTask(page,other);await createProject(page,c);await openProject(page,c);await configured(page,c,archived,{date});await page.goto('/');await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  18 |   await directory(page,q,dated);await result(page,[a,b],['1/3 completed','0/1 completed'],[dated,empty,late,other],'1/4 completed');await expect(status(page).locator('option:checked')).toHaveText('All');
  19 |   await status(page).selectOption({label:'Dated'});await result(page,[a],['1/2 completed'],[dated,late],'1/2 completed');await status(page).selectOption({label:'Undated'});await result(page,[a,b],['0/1 completed','0/1 completed'],[empty,other],'0/2 completed');
  20 |   await range(page,date);await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'Dated'});await result(page,[a],['0/1 completed'],[dated],'0/1 completed');await bounds(page,date,'');await result(page,[a],['1/2 completed'],[dated,late],'1/2 completed');
  21 |   await status(page).selectOption({label:'Undated'});await result(page,[],[],[],'0/0 completed');await bounds(page,'',date);await result(page,[],[],[],'0/0 completed');await range(page,'');await result(page,[a,b],['0/1 completed','0/1 completed'],[empty,other],'0/2 completed');
  22 |   await status(page).selectOption({label:'All'});await result(page,[a,b],['1/3 completed','0/1 completed'],[dated,empty,late,other],'1/4 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await status(page).selectOption({label:'Undated'});await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'Dated'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await protectedWrites(page);
  23 |  });
  24 |  test('118 presence matches govern word filters ordering exports all bulk writes and protected tasks',async({page})=>{
  25 |   test.setTimeout(240000);const a='Due bulk Z first',b='Due bulk A second',c='Due bulk archived',x='ZirconDue'+stage,y='AmberDue'+stage,q=x.toLowerCase()+' '+y.toLowerCase(),date=String(2750+stage)+'-02-28',note='  Due original Ω\nkept  ';
  26 |   const first=x+' gap '+y+' zulu',second=y+' gap '+x+' alpha',guard=x+' gap '+y+' undated guard',deleted=x+' gap '+y+' deleted',archived=x+' gap '+y+' archived';
  27 |   await createProject(page,a);await openProject(page,a);await configured(page,a,first,{priority:'High',date,notes:note});await configured(page,a,guard,{priority:'High',notes:'Guard original'});await configured(page,a,deleted,{priority:'High',date,notes:note,deleted:true});await createProject(page,b);await openProject(page,b);await configured(page,b,second,{priority:'High',date,notes:note,completed:true});await createProject(page,c);await openProject(page,c);await configured(page,c,archived,{priority:'High',date,notes:note});await page.goto('/');await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  28 |   await directory(page,q,first);await result(page,[],[],[],'0/0 completed');await mode(page).selectOption({label:'All words'});await result(page,[a,b],['0/2 completed','1/1 completed'],[first,guard,second],'1/3 completed');await status(page).selectOption({label:'Dated'});await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');
  29 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await range(page,String(2750+stage)+'-03-01');await result(page,[],[],[],'0/0 completed');await range(page,date);await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');
  30 |   await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');const snapshot=await workspace(page);expect(snapshot.map(p=>p.name)).toEqual([projectName(a),projectName(b)]);expect(snapshot.flatMap(p=>p.tasks).map(t=>t.title)).toEqual([first,second]);
  31 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a],['0/1 completed'],[first],'0/1 completed');await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await expectPersistedCompletion(page,a,first,true);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[a,b],['1/1 completed','1/1 completed'],[second,first],'2/2 completed');await page.getByRole('button',{name:'Reopen visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await expectPersistedCompletion(page,a,first,false);await expectPersistedCompletion(page,b,second,false);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  32 |   await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await result(page,[],[],[],'0/0 completed');await expectPersistedPriority(page,a,first,'Low');await expectPersistedPriority(page,b,second,'Low');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  33 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill('');await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await result(page,[],[],[],'0/0 completed');await controls(page,{q,due:'Dated',priority:'Low',order:'Title',word:'All words',from:date,through:date});await fieldStored(page,a,first,'Task due date','');await fieldStored(page,b,second,'Task due date','');
  34 |   // Re-enter after the completed mutation; the remaining actions begin from positively observed matches.
  35 |   await directory(page,q,guard);await result(page,[],[],[],'0/0 completed');await mode(page).selectOption({label:'All words'});await result(page,[a,b],['0/2 completed','0/1 completed'],[first,guard,second],'0/3 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[a,b],['0/1 completed','0/1 completed'],[first,second],'0/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await status(page).selectOption({label:'Dated'});await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'Undated'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  36 |   const changed='  Due changed λ\nkept  ';await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(changed);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([changed,changed]);await fieldStored(page,a,first,'Task notes',changed);await fieldStored(page,b,second,'Task notes',changed);expect((await workspace(page)).flatMap(p=>p.tasks).map(t=>[t.notes,t.dueDate])).toEqual([[changed,''],[changed,'']]);
  37 |   await page.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await protectedWrites(page);await page.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  38 |   await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'Dated'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await protectedWrites(page);await expect(page.getByRole('button',{name:'Restore visible tasks',exact:true})).toBeDisabled();
  39 |   const o=await page.context().newPage();try{await returnTo(o,a);await expect(taskRow(o,guard).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Guard original');await expect(taskRow(o,guard).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('');await expect(taskRow(o,guard).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await o.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(o,deleted).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(note);await expect(taskRow(o,deleted).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);}finally{await o.close();}
  40 |  });
  41 |  test('119 presence summaries and matching export keep duplicate imported owners separate and remain read-only',async({page})=>{
  42 |   test.setTimeout(90000);const a='Due duplicate owner',q='DueDuplicate'+stage,date=String(2780+stage)+'-02-28';const task=(suffix,due,completed,notes)=>({title:q+' '+suffix,completed,priority:'High',dueDate:due,notes,deleted:false});
  43 |   const first=[task('dated first',date,false,'  First Ω\nkept  '),task('empty first','',true,'First empty')],second=[task('dated second',date,true,'Second dated'),task('empty second','',false,'  Second λ  ')],third=[task('archived',date,false,'Archived original')];const projects=[{name:projectName(a),archived:false,defaultPriority:'High',tasks:first},{name:projectName(a),archived:false,defaultPriority:'Low',tasks:second},{name:projectName(a),archived:true,defaultPriority:'Normal',tasks:third}];
  44 |   await page.goto('/');await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify({format:'workboard-workspace',version:1,projects}));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await expect(projectRow(page,a).first()).toBeVisible();await expect(projectRow(page,a)).toHaveCount(2);
  45 |   await directory(page,q,first[0].title);await result(page,[a,a],['1/2 completed','1/2 completed'],[...first,...second].map(t=>t.title),'2/4 completed');await status(page).selectOption({label:'Dated'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first[0].title,second[0].title],'1/2 completed');expect(await workspace(page)).toEqual(projects.slice(0,2).map((p,i)=>({...p,tasks:[i?second[0]:first[0]]})));
  46 |   await status(page).selectOption({label:'Undated'});await result(page,[a,a],['1/1 completed','0/1 completed'],[first[1].title,second[1].title],'1/2 completed');expect(await workspace(page)).toEqual(projects.slice(0,2).map((p,i)=>({...p,tasks:[i?second[1]:first[1]]})));await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();expect(await download(page)).toEqual(projects[1]);
  47 |   await directory(page,q,first[0].title);await result(page,[a,a],['1/2 completed','1/2 completed'],[...first,...second].map(t=>t.title),'2/4 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[a],['0/1 completed'],[third[0].title],'0/1 completed');await status(page).selectOption({label:'Undated'});await result(page,[],[],[],'0/0 completed');await protectedWrites(page);await status(page).selectOption({label:'Dated'});await result(page,[a],['0/1 completed'],[third[0].title],'0/1 completed');expect(await workspace(page)).toEqual([projects[2]]);await protectedWrites(page);
  48 |   for(let i=0;i<2;i++){await page.goto('/');await expect(projectRow(page,a).first()).toBeVisible();await expect(projectRow(page,a)).toHaveCount(2);await projectRow(page,a).nth(i).getByRole('button',{name:'Open project',exact:true}).click();expect(await download(page)).toEqual(projects[i]);}
  49 |  });
  50 |  test('120 date membership writes preserve both remembered positions metadata and restart seed',async({page})=>{
  51 |   test.setTimeout(180000);const a='Due restart first',b='Due restart second',travel='DueRestart'+stage+' travelling',before='Due before '+stage,after='Due after '+stage,hold='Due hold '+stage,later='Due later '+stage,date=String(2800+stage)+'-02-28',changed=String(2800+stage)+'-03-01',note='  Due restart Ω\nkept  ';
  52 |   await createProject(page,a);await openProject(page,a);await configured(page,a,before,{date,notes:'Before original'});await configured(page,a,travel,{date,priority:'High',notes:note,completed:true});await createTask(page,after);await createProject(page,b);await openProject(page,b);await createTask(page,hold);
  53 |   async function move(source,target,sourceOrder,targetOrder){await returnTo(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const o=await page.context().newPage();try{await returnTo(o,target);await titles(o,targetOrder);await returnTo(o,source);await titles(o,sourceOrder);}finally{await o.close();}await returnTo(page,target);}
  54 |   await move(a,b,[before,after],[hold,travel]);await createTask(page,later);await move(b,a,[hold,later],[before,travel,after]);const original=await download(page);await directory(page,travel,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await status(page).selectOption({label:'Undated'});await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'Dated'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');
  55 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill('');await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await result(page,[],[],[],'0/0 completed');await controls(page,{q:travel,due:'Dated'});await fieldStored(page,a,travel,'Task due date','');await status(page).selectOption({label:'Undated'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');
  56 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(changed);await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await result(page,[],[],[],'0/0 completed');await controls(page,{q:travel,due:'Undated'});await fieldStored(page,a,travel,'Task due date',changed);await status(page).selectOption({label:'Dated'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');expect((await workspace(page))[0].tasks).toEqual([{...original.tasks[1],dueDate:changed}]);
  57 |   await returnTo(page,a);expect(await download(page)).toEqual({...original,tasks:original.tasks.map(t=>t.title===travel?{...t,dueDate:changed}:t)});await move(a,b,[before,after],[hold,travel,later]);await move(b,a,[hold,later],[before,travel,after]);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(note);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(changed);
  58 |  });
  59 |  test('121 every directory bulk operation applies due presence without relying on a date range',async({page})=>{
  60 |   test.setTimeout(180000);const a='Due independent bulk',q='DueIndependent'+stage,date=String(2850+stage)+'-02-28',changedDate=String(2850+stage)+'-03-01';
  61 |   const dated=q+' dated',empty=q+' empty',deleted=q+' protected deleted',original='  Dated original Ω\nkept  ',changed='  Empty changed λ\nkept  ';
  62 |   await createProject(page,a);await openProject(page,a);await configured(page,a,dated,{priority:'High',date,notes:original});await configured(page,a,empty,{priority:'High',notes:'Empty original'});await configured(page,a,deleted,{priority:'High',date,notes:'Deleted original',deleted:true});
  63 |   await directory(page,q,dated);await result(page,[a],['0/2 completed'],[dated,empty],'0/2 completed');await status(page).selectOption({label:'Dated'});await result(page,[a],['0/1 completed'],[dated],'0/1 completed');expect((await workspace(page))[0].tasks.map(t=>t.title)).toEqual([dated]);
  64 |   await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();await result(page,[a],['1/1 completed'],[dated],'1/1 completed');await expectPersistedCompletion(page,a,dated,true);await expectPersistedCompletion(page,a,empty,false);
  65 |   const completionObserver=await page.context().newPage();try{await returnTo(completionObserver,a);await completionObserver.getByRole('checkbox',{name:'Complete '+empty,exact:true}).check();await expectPersistedCompletion(completionObserver,a,empty,true);}finally{await completionObserver.close();}
  66 |   await page.getByRole('button',{name:'Reopen visible tasks',exact:true}).click();await result(page,[a],['0/1 completed'],[dated],'0/1 completed');await expectPersistedCompletion(page,a,dated,false);await expectPersistedCompletion(page,a,empty,true);
  67 |   await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await expect(rows(page).getByTestId('directory-task-priority')).toHaveText(['Low']);await expectPersistedPriority(page,a,dated,'Low');await expectPersistedPriority(page,a,empty,'High');
> 68 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(changedDate);await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await expect(rows(page).getByTestId('directory-task-due-date')).toHaveText([changedDate]);await fieldStored(page,a,dated,'Task due date',changedDate);await fieldStored(page,a,empty,'Task due date','');
     |                                                                                                                                                                                                                                                 ^ Error: expect(locator).toHaveText(expected) failed
  69 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill('');await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await result(page,[],[],[],'0/0 completed');await fieldStored(page,a,dated,'Task due date','');
  70 |   // Establish an independent nonmatching dated task for the remaining Undated actions.
  71 |   const observer=await page.context().newPage();try{await returnTo(observer,a);await taskRow(observer,dated).getByRole('textbox',{name:'Task due date',exact:true}).fill(date);await taskRow(observer,dated).getByRole('button',{name:'Save due date',exact:true}).click();await fieldStored(observer,a,dated,'Task due date',date);}finally{await observer.close();}
  72 |   await directory(page,q,dated);await result(page,[a],['1/2 completed'],[dated,empty],'1/2 completed');await status(page).selectOption({label:'Undated'});await result(page,[a],['1/1 completed'],[empty],'1/1 completed');
  73 |   await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(changed);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([changed]);await fieldStored(page,a,empty,'Task notes',changed);await fieldStored(page,a,dated,'Task notes',original);
  74 |   await page.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['1/1 completed'],[empty],'1/1 completed');await page.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');
  75 |   await status(page).selectOption({label:'All'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a],['1/2 completed'],[dated,empty],'1/2 completed');
  76 |   await returnTo(page,a);expect((await download(page)).tasks).toEqual([{title:dated,completed:false,priority:'Low',dueDate:date,notes:original,deleted:false},{title:empty,completed:true,priority:'High',dueDate:'',notes:changed,deleted:false},{title:deleted,completed:false,priority:'High',dueDate:date,notes:'Deleted original',deleted:true}]);
  77 |  });
  78 | }
  79 | 
```