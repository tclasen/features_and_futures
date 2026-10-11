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

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-priority')
Timeout: 5000ms
- Expected  - 3
+ Received  + 1

- Array [
-   "Low",
- ]
+ Array []

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-priority') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-priority')
    14 × locator resolved to 0 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f39e1]:
  - heading "Task directory" [level=1] [ref=f39e2]
  - text: 0/0 completed
  - group [ref=f39e4]:
    - button "Complete visible tasks" [disabled] [ref=f39e5]
  - group [ref=f39e7]:
    - button "Reopen visible tasks" [disabled] [ref=f39e8]
  - paragraph [ref=f39e9]: No matching tasks
  - group [ref=f39e11]:
    - button "Delete visible tasks" [disabled] [ref=f39e12]
  - group [ref=f39e14]:
    - button "Restore visible tasks" [disabled] [ref=f39e15]
  - group [ref=f39e17]:
    - generic [ref=f39e18]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f39e19]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f39e20]
  - group [ref=f39e22]:
    - generic [ref=f39e23]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f39e24]
    - button "Save visible due date" [disabled] [ref=f39e25]
  - group [ref=f39e27]:
    - generic [ref=f39e28]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [disabled] [ref=f39e29]
    - button "Save visible notes" [disabled] [ref=f39e30]
  - group [ref=f39e32]:
    - button "Export matching workspace" [ref=f39e33]
  - group [ref=f39e35]:
    - button "Projects" [ref=f39e36]
  - generic [ref=f39e38]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f39e39]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f39e41]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f39e42]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f39e44]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f39e45]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f39e47]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f39e48]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f39e50]:
    - text: Directory order
    - combobox "Directory order" [ref=f39e51]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f39e53]:
    - text: Project scope
    - combobox "Project scope" [ref=f39e54]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f39e56]:
    - text: Task filter
    - combobox "Task filter" [ref=f39e57]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f39e59]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f39e60]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f39e62]:
    - generic [ref=f39e63]:
      - text: Directory search
      - textbox "Directory search" [ref=f39e64]: OwnerBulk37
    - button "Search directory" [ref=f39e65]
  - group [ref=f39e67]:
    - generic [ref=f39e68]:
      - text: Due from
      - textbox "Due from" [ref=f39e69]
    - generic [ref=f39e70]:
      - text: Due through
      - textbox "Due through" [ref=f39e71]
    - button "Apply due range" [ref=f39e72]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | import {rows,owners,titles,result,directory,returnTo,configured,range,query,download,workspace,fieldStored,protectedWrites} from './directory-presence-helpers.mjs';
  4  | const filter=p=>p.getByRole('combobox',{name:'Project default priority',exact:true});
  5  | const defaults=p=>p.getByRole('combobox',{name:'Default task priority',exact:true});
  6  | async function defaultStored(p,owner,value){const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return defaults(o).locator('option:checked').textContent();}).toBe(value);}finally{await o.close();}}
  7  | async function project(p,owner,value='Normal'){await createProject(p,owner);await openProject(p,owner);if(value!=='Normal'){await defaults(p).selectOption({label:value});await defaultStored(p,owner,value);await returnTo(p,owner);}}
  8  | async function controls(p,q,value){await expect(filter(p).locator('option:checked')).toHaveText(value);await expect(p.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q);}
  9  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  10 | if(stage>=37){
  11 |  test('126 owner default differs from task priority and intersects notes dates completion and archived scope',async({page})=>{
  12 |   test.setTimeout(120000);const a='Owner low first',b='Owner high second',c='Owner normal third',d='Owner archived low',q='OwnerDefault'+stage,date=String(3000+stage)+'-03-01';const first=q+' high task',low=q+' low task',second=q+' other low',normal=q+' normal owner',archived=q+' archived';
  13 |   await project(page,a,'Low');await configured(page,a,first,{priority:'High',date,notes:'  Owner Ω\nkept  '});await configured(page,a,low,{priority:'Low',completed:true});await project(page,b,'High');await configured(page,b,second,{priority:'Low',date});await project(page,c);await configured(page,c,normal,{priority:'High',date});await project(page,d,'Low');await configured(page,d,archived,{priority:'High',date,notes:'Archived literal'});await page.goto('/');await projectRow(page,d).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,d)).toHaveCount(0);
  14 |   await directory(page,q,first);await result(page,[a,b,c],['1/2 completed','0/1 completed','0/1 completed'],[first,low,second,normal],'1/4 completed');await expect(filter(page).locator('option:checked')).toHaveText('All');await filter(page).selectOption({label:'Low'});await result(page,[a],['1/2 completed'],[first,low],'1/2 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a],['0/1 completed'],[first],'0/1 completed');await filter(page).selectOption({label:'High'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[b],['0/1 completed'],[second],'0/1 completed');await filter(page).selectOption({label:'Normal'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[c],['0/1 completed'],[normal],'0/1 completed');await filter(page).selectOption({label:'Low'});await result(page,[a],['0/1 completed'],[first],'0/1 completed');
  15 |   await page.getByRole('combobox',{name:'Directory notes status',exact:true}).selectOption({label:'Empty'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Directory notes status',exact:true}).selectOption({label:'Present'});await result(page,[a],['0/1 completed'],[first],'0/1 completed');await page.getByRole('combobox',{name:'Directory due status',exact:true}).selectOption({label:'Undated'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Directory due status',exact:true}).selectOption({label:'Dated'});await result(page,[a],['0/1 completed'],[first],'0/1 completed');await range(page,date);await result(page,[a],['0/1 completed'],[first],'0/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a],['0/1 completed'],[first],'0/1 completed');await query(page,q+' missing');await result(page,[],[],[],'0/0 completed');await query(page,q);await result(page,[a],['0/1 completed'],[first],'0/1 completed');await query(page,'high task '+q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Directory search mode',exact:true}).selectOption({label:'All words'});await result(page,[a],['0/1 completed'],[first],'0/1 completed');await query(page,q+' missing');await result(page,[],[],[],'0/0 completed');await query(page,q);await result(page,[a],['0/1 completed'],[first],'0/1 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[d],['0/1 completed'],[archived],'0/1 completed');await protectedWrites(page);await controls(page,q,'Low');
  16 |   await defaultStored(page,a,'Low');await defaultStored(page,b,'High');await defaultStored(page,c,'Normal');await expectPersistedPriority(page,a,first,'High');await expectPersistedPriority(page,b,second,'Low');
  17 |  });
  18 |  test('127 every bulk action honors owner default and preserves defaults and nonmatching tasks',async({page})=>{
  19 |   test.setTimeout(180000);const a='Owner bulk high',b='Owner bulk low',q='OwnerBulk'+stage,target=q+' target',guard=q+' guard',deleted=q+' protected deleted',date=String(3020+stage)+'-03-01',notes='  Owner bulk Ω\nkept  ';
  20 |   await project(page,a,'High');await configured(page,a,target,{priority:'High'});await project(page,b,'Low');await configured(page,b,guard,{priority:'High'});await configured(page,b,deleted,{priority:'High',date,notes:'Protected',deleted:true});await directory(page,q,target);await result(page,[a,b],['0/1 completed','0/1 completed'],[target,guard],'0/2 completed');await filter(page).selectOption({label:'High'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');
  21 |   await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();await result(page,[a],['1/1 completed'],[target],'1/1 completed');await expectPersistedCompletion(page,a,target,true);await expectPersistedCompletion(page,b,guard,false);const o=await page.context().newPage();try{await returnTo(o,b);await o.getByRole('checkbox',{name:'Complete '+guard,exact:true}).check();await expectPersistedCompletion(o,b,guard,true);}finally{await o.close();}
> 22 |   await page.getByRole('button',{name:'Reopen visible tasks',exact:true}).click();await result(page,[a],['0/1 completed'],[target],'0/1 completed');await expectPersistedCompletion(page,b,guard,true);await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await expect(rows(page).getByTestId('directory-task-priority')).toHaveText(['Low']);await expectPersistedPriority(page,a,target,'Low');await expectPersistedPriority(page,b,guard,'High');await controls(page,q,'High');
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                ^ Error: expect(locator).toHaveText(expected) failed
  23 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(date);await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await expect(rows(page).getByTestId('directory-task-due-date')).toHaveText([date]);await fieldStored(page,b,guard,'Task due date','');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(notes);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([notes]);await fieldStored(page,b,guard,'Task notes','');expect(await workspace(page)).toEqual([{name:projectName(a),archived:false,defaultPriority:'High',tasks:[{title:target,completed:false,priority:'Low',dueDate:date,notes,deleted:false}]}]);
  24 |   await page.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');await protectedWrites(page);await page.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await filter(page).selectOption({label:'All'});await result(page,[b],['0/1 completed'],[deleted],'0/1 completed');await defaultStored(page,a,'High');await defaultStored(page,b,'Low');
  25 |   await returnTo(page,b);expect((await download(page)).tasks).toEqual([{title:guard,completed:true,priority:'High',dueDate:'',notes:'',deleted:false},{title:deleted,completed:false,priority:'High',dueDate:date,notes:'Protected',deleted:true}]);await returnTo(page,a);await createTask(page,'New inherited high');await expectPersistedPriority(page,a,'New inherited high','High');
  26 |  });
  27 |  test('128 duplicate imported owners use current defaults through rename archive and restoration',async({page})=>{
  28 |   test.setTimeout(120000);const a='Owner duplicate',renamed='Owner duplicate renamed',q='OwnerDuplicate'+stage,date=String(3040+stage)+'-03-01';const task=(suffix,priority)=>({title:q+' '+suffix,completed:false,priority,dueDate:date,notes:'  '+suffix+' Ω\nkept  ',deleted:false});const first=[task('Z high owner low task','Low')],second=[task('A low owner high task','High')],third=[task('archived normal','High')];const projects=[{name:projectName(a),archived:false,defaultPriority:'High',tasks:first},{name:projectName(a),archived:false,defaultPriority:'Low',tasks:second},{name:projectName(a),archived:true,defaultPriority:'Normal',tasks:third}];
  29 |   await page.goto('/');await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify({format:'workboard-workspace',version:1,projects}));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await expect(projectRow(page,a).first()).toBeVisible();await expect(projectRow(page,a)).toHaveCount(2);await directory(page,q,first[0].title);await result(page,[a,a],['0/1 completed','0/1 completed'],[first[0].title,second[0].title],'0/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['0/1 completed','0/1 completed'],[second[0].title,first[0].title],'0/2 completed');await filter(page).selectOption({label:'Low'});await result(page,[a],['0/1 completed'],[second[0].title],'0/1 completed');expect(await workspace(page)).toEqual([projects[1]]);await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText('Title');await owners(page).first().getByRole('button',{name:'Open project',exact:true}).click();expect(await download(page)).toEqual(projects[1]);await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(renamed));await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName(renamed),exact:true}).first()).toBeVisible();await defaults(page).selectOption({label:'Normal'});await defaultStored(page,renamed,'Normal');await returnTo(page,renamed);expect(await download(page)).toEqual({...projects[1],name:projectName(renamed),defaultPriority:'Normal'});
  30 |   await directory(page,q,first[0].title);await result(page,[a,renamed],['0/1 completed','0/1 completed'],[first[0].title,second[0].title],'0/2 completed');await filter(page).selectOption({label:'Low'});await result(page,[],[],[],'0/0 completed');await filter(page).selectOption({label:'Normal'});await result(page,[renamed],['0/1 completed'],[second[0].title],'0/1 completed');await page.goto('/');await projectRow(page,renamed).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,renamed)).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,renamed).getByRole('button',{name:'Restore project',exact:true})).toBeVisible();await projectRow(page,renamed).getByRole('button',{name:'Restore project',exact:true}).click();const restored=await page.context().newPage();try{await restored.goto('/');await restored.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(restored,renamed);expect(await download(restored)).toEqual({...projects[1],name:projectName(renamed),defaultPriority:'Normal'});}finally{await restored.close();}
  31 |   await directory(page,q,first[0].title);await result(page,[a,renamed],['0/1 completed','0/1 completed'],[first[0].title,second[0].title],'0/2 completed');await filter(page).selectOption({label:'Normal'});await result(page,[renamed],['0/1 completed'],[second[0].title],'0/1 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[a],['0/1 completed'],[third[0].title],'0/1 completed');expect(await workspace(page)).toEqual([projects[2]]);await protectedWrites(page);
  32 |  });
  33 |  test('129 owner changes move default membership while preserving both remembered task positions',async({page})=>{
  34 |   test.setTimeout(180000);const a='Owner restart first',b='Owner restart second',travel='OwnerRestart'+stage+' travelling',before='Owner before '+stage,after='Owner after '+stage,hold='Owner hold '+stage,later='Owner later '+stage,date=String(3060+stage)+'-03-01',notes='  Owner restart Ω\nkept  ';
  35 |   await project(page,a,'High');await createTask(page,before);await configured(page,a,travel,{priority:'High',date,completed:true});await createTask(page,after);await project(page,b,'Low');await createTask(page,hold);
  36 |   async function move(source,target,sourceOrder,targetOrder){await returnTo(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const o=await page.context().newPage();try{await returnTo(o,target);await titles(o,targetOrder);await returnTo(o,source);await titles(o,sourceOrder);}finally{await o.close();}}
  37 |   await move(a,b,[before,after],[hold,travel]);await returnTo(page,b);await createTask(page,later);await directory(page,travel,travel);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await filter(page).selectOption({label:'High'});await result(page,[],[],[],'0/0 completed');await filter(page).selectOption({label:'Low'});await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(notes);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([notes]);await fieldStored(page,b,travel,'Task notes',notes);await controls(page,travel,'Low');await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await defaults(page).selectOption({label:'Normal'});await defaultStored(page,a,'Normal');await expectPersistedPriority(page,a,travel,'High');
  38 |   await directory(page,travel,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await filter(page).selectOption({label:'High'});await result(page,[],[],[],'0/0 completed');await filter(page).selectOption({label:'Normal'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await move(a,b,[before,after],[hold,travel,later]);await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(notes);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expectPersistedCompletion(page,a,travel,true);
  39 |  });
  40 | }
  41 | 
```