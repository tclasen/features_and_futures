# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-default.spec.mjs >> 128 duplicate imported owners use current defaults through rename archive and restoration
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task037-executed-suite/directory-project-default.spec.mjs:27:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').filter({ hasText: 'task-037 Owner duplicate renamed' }).visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').filter({ hasText: 'task-037 Owner duplicate renamed' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-037 Owner duplicate renamed' }).visible()
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=f13e1]:
  - heading "Workboard" [level=1] [ref=f13e2]
  - group [ref=f13e4]:
    - button "Task directory" [ref=f13e5]
  - group [ref=f13e7]:
    - generic [ref=f13e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f13e9]
    - generic [ref=f13e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f13e11]
    - button "Import project" [ref=f13e12]
  - group [ref=f13e14]:
    - generic [ref=f13e15]:
      - text: Workspace JSON
      - textbox "Workspace JSON" [ref=f13e16]
    - button "Import workspace" [ref=f13e17]
  - group [ref=f13e19]:
    - generic [ref=f13e20]:
      - text: Project name
      - textbox "Project name" [ref=f13e21]
    - button "Create project" [ref=f13e22]
  - group [ref=f13e24]:
    - generic [ref=f13e25]:
      - text: Project search
      - textbox "Project search" [ref=f13e26]
    - button "Search projects" [ref=f13e27]
  - generic [ref=f13e29]:
    - text: Project filter
    - combobox "Project filter" [ref=f13e30]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f13e31]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f13e33]:
      - button "Open project" [ref=f13e34]
    - group [ref=f13e36]:
      - button "Archive project" [ref=f13e37]
  - generic [ref=f13e38]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f13e40]:
      - button "Open project" [ref=f13e41]
    - group [ref=f13e43]:
      - button "Archive project" [ref=f13e44]
  - generic [ref=f13e45]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f13e47]:
      - button "Open project" [ref=f13e48]
    - group [ref=f13e50]:
      - button "Archive project" [ref=f13e51]
  - generic [ref=f13e52]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f13e54]:
      - button "Open project" [ref=f13e55]
    - group [ref=f13e57]:
      - button "Archive project" [ref=f13e58]
  - generic [ref=f13e59]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f13e61]:
      - button "Open project" [ref=f13e62]
    - group [ref=f13e64]:
      - button "Archive project" [ref=f13e65]
  - generic [ref=f13e66]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f13e68]:
      - button "Open project" [ref=f13e69]
    - group [ref=f13e71]:
      - button "Archive project" [ref=f13e72]
  - generic [ref=f13e73]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f13e75]:
      - button "Open project" [ref=f13e76]
    - group [ref=f13e78]:
      - button "Archive project" [ref=f13e79]
  - generic [ref=f13e80]:
    - text: task-032 Legacy title owner0/1 completed
    - group [ref=f13e82]:
      - button "Open project" [ref=f13e83]
    - group [ref=f13e85]:
      - button "Archive project" [ref=f13e86]
  - generic [ref=f13e87]:
    - text: task-037 Owner low first1/2 completed
    - group [ref=f13e89]:
      - button "Open project" [ref=f13e90]
    - group [ref=f13e92]:
      - button "Archive project" [ref=f13e93]
  - generic [ref=f13e94]:
    - text: task-037 Owner high second0/1 completed
    - group [ref=f13e96]:
      - button "Open project" [ref=f13e97]
    - group [ref=f13e99]:
      - button "Archive project" [ref=f13e100]
  - generic [ref=f13e101]:
    - text: task-037 Owner normal third0/1 completed
    - group [ref=f13e103]:
      - button "Open project" [ref=f13e104]
    - group [ref=f13e106]:
      - button "Archive project" [ref=f13e107]
  - generic [ref=f13e108]:
    - text: task-037 Owner bulk high0/2 completed
    - group [ref=f13e110]:
      - button "Open project" [ref=f13e111]
    - group [ref=f13e113]:
      - button "Archive project" [ref=f13e114]
  - generic [ref=f13e115]:
    - text: task-037 Owner bulk low1/1 completed
    - group [ref=f13e117]:
      - button "Open project" [ref=f13e118]
    - group [ref=f13e120]:
      - button "Archive project" [ref=f13e121]
  - generic [ref=f13e122]:
    - text: task-037 Owner duplicate0/1 completed
    - group [ref=f13e124]:
      - button "Open project" [ref=f13e125]
    - group [ref=f13e127]:
      - button "Archive project" [ref=f13e128]
  - generic [ref=f13e129]:
    - text: task-037 Owner duplicate renamed0/1 completed
    - group [ref=f13e131]:
      - button "Open project" [ref=f13e132]
    - group [ref=f13e134]:
      - button "Archive project" [ref=f13e135]
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
  22 |   await page.getByRole('button',{name:'Reopen visible tasks',exact:true}).click();await result(page,[a],['0/1 completed'],[target],'0/1 completed');await expectPersistedCompletion(page,b,guard,true);await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await expect(rows(page).getByTestId('directory-task-priority')).toHaveText(['Low']);await expectPersistedPriority(page,a,target,'Low');await expectPersistedPriority(page,b,guard,'High');await controls(page,q,'High');
  23 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(date);await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await expect(rows(page).getByTestId('directory-task-due-date')).toHaveText([date]);await fieldStored(page,b,guard,'Task due date','');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(notes);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([notes]);await fieldStored(page,b,guard,'Task notes','');expect(await workspace(page)).toEqual([{name:projectName(a),archived:false,defaultPriority:'High',tasks:[{title:target,completed:false,priority:'Low',dueDate:date,notes,deleted:false}]}]);
  24 |   await page.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');await protectedWrites(page);await page.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await filter(page).selectOption({label:'All'});await result(page,[b],['0/1 completed'],[deleted],'0/1 completed');await defaultStored(page,a,'High');await defaultStored(page,b,'Low');
  25 |   await returnTo(page,b);expect((await download(page)).tasks).toEqual([{title:guard,completed:true,priority:'High',dueDate:'',notes:'',deleted:false},{title:deleted,completed:false,priority:'High',dueDate:date,notes:'Protected',deleted:true}]);await returnTo(page,a);await createTask(page,'New inherited high');await expectPersistedPriority(page,a,'New inherited high','High');
  26 |  });
  27 |  test('128 duplicate imported owners use current defaults through rename archive and restoration',async({page})=>{
  28 |   test.setTimeout(120000);const a='Owner duplicate',renamed='Owner duplicate renamed',q='OwnerDuplicate'+stage,date=String(3040+stage)+'-03-01';const task=(suffix,priority)=>({title:q+' '+suffix,completed:false,priority,dueDate:date,notes:'  '+suffix+' Ω\nkept  ',deleted:false});const first=[task('Z high owner low task','Low')],second=[task('A low owner high task','High')],third=[task('archived normal','High')];const projects=[{name:projectName(a),archived:false,defaultPriority:'High',tasks:first},{name:projectName(a),archived:false,defaultPriority:'Low',tasks:second},{name:projectName(a),archived:true,defaultPriority:'Normal',tasks:third}];
  29 |   await page.goto('/');await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify({format:'workboard-workspace',version:1,projects}));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await expect(projectRow(page,a).first()).toBeVisible();await expect(projectRow(page,a)).toHaveCount(2);await directory(page,q,first[0].title);await result(page,[a,a],['0/1 completed','0/1 completed'],[first[0].title,second[0].title],'0/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['0/1 completed','0/1 completed'],[second[0].title,first[0].title],'0/2 completed');await filter(page).selectOption({label:'Low'});await result(page,[a],['0/1 completed'],[second[0].title],'0/1 completed');expect(await workspace(page)).toEqual([projects[1]]);await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText('Title');await owners(page).first().getByRole('button',{name:'Open project',exact:true}).click();expect(await download(page)).toEqual(projects[1]);await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(renamed));await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName(renamed),exact:true}).first()).toBeVisible();await defaults(page).selectOption({label:'Normal'});await defaultStored(page,renamed,'Normal');await returnTo(page,renamed);expect(await download(page)).toEqual({...projects[1],name:projectName(renamed),defaultPriority:'Normal'});
> 30 |   await directory(page,q,first[0].title);await result(page,[a,renamed],['0/1 completed','0/1 completed'],[first[0].title,second[0].title],'0/2 completed');await filter(page).selectOption({label:'Low'});await result(page,[],[],[],'0/0 completed');await filter(page).selectOption({label:'Normal'});await result(page,[renamed],['0/1 completed'],[second[0].title],'0/1 completed');await page.goto('/');await projectRow(page,renamed).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,renamed)).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,renamed).getByRole('button',{name:'Restore project',exact:true})).toBeVisible();await projectRow(page,renamed).getByRole('button',{name:'Restore project',exact:true}).click();await expect(projectRow(page,renamed)).toHaveCount(0);
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ^ Error: expect(locator).toHaveCount(expected) failed
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