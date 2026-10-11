# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owner-default-edit.spec.mjs >> 138 default assignment uses the initial represented owners and preserves all existing tasks and defaults elsewhere
- Location: experiments/instruction-effects/revisions/research-v011/preflight/task040-executed01-suite/directory-owner-default-edit.spec.mjs:19:2

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

@@ -12,11 +12,11 @@
        "priority": "High",
        "title": "EditDefaults40 Zulu",
      },
      Object {
        "completed": false,
-       "deleted": true,
+       "deleted": false,
        "dueDate": "",
        "notes": "Deleted excluded",
        "priority": "Low",
        "title": "Excluded edit literal 40",
      },
```

# Page snapshot

```yaml
- generic [active] [ref=f56e1]:
  - heading "Task directory" [level=1] [ref=f56e2]
  - text: 1/2 completed
  - generic [ref=f56e3]:
    - text: task-040 Default edit first1/1 completed
    - group [ref=f56e5]:
      - button "Open project" [ref=f56e6]
  - generic [ref=f56e7]:
    - text: task-040 Default edit second0/1 completed
    - group [ref=f56e9]:
      - button "Open project" [ref=f56e10]
  - group [ref=f56e12]:
    - button "Complete visible tasks" [ref=f56e13]
  - group [ref=f56e15]:
    - button "Reopen visible tasks" [ref=f56e16]
  - group [ref=f56e18]:
    - button "Delete visible tasks" [ref=f56e19]
  - group [ref=f56e21]:
    - button "Restore visible tasks" [disabled] [ref=f56e22]
  - group [ref=f56e24]:
    - generic [ref=f56e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f56e26]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f56e27]
  - group [ref=f56e29]:
    - generic [ref=f56e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f56e31]
    - button "Save visible due date" [ref=f56e32]
  - group [ref=f56e34]:
    - generic [ref=f56e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f56e36]
    - button "Save visible notes" [ref=f56e37]
  - group [ref=f56e39]:
    - generic [ref=f56e40]:
      - text: Visible projects default priority
      - combobox "Visible projects default priority" [ref=f56e41]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible project default" [ref=f56e42]
  - group [ref=f56e44]:
    - button "Archive visible projects" [ref=f56e45]
  - group [ref=f56e47]:
    - button "Restore visible projects" [disabled] [ref=f56e48]
  - group [ref=f56e50]:
    - button "Export matching workspace" [ref=f56e51]
  - group [ref=f56e53]:
    - button "Projects" [ref=f56e54]
  - generic [ref=f56e56]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f56e57]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f56e59]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f56e60]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f56e62]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f56e63]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f56e65]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f56e66]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
      - option "Starts with"
  - generic [ref=f56e68]:
    - text: Directory order
    - combobox "Directory order" [ref=f56e69]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f56e71]:
    - text: Project scope
    - combobox "Project scope" [ref=f56e72]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f56e74]:
    - text: Task filter
    - combobox "Task filter" [ref=f56e75]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f56e77]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f56e78]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f56e80]:
    - generic [ref=f56e81]:
      - text: Directory search
      - textbox "Directory search" [ref=f56e82]: EditDefaults40
    - button "Search directory" [ref=f56e83]
  - group [ref=f56e85]:
    - generic [ref=f56e86]:
      - text: Due from
      - textbox "Due from" [ref=f56e87]
    - generic [ref=f56e88]:
      - text: Due through
      - textbox "Due through" [ref=f56e89]
    - button "Apply due range" [ref=f56e90]
  - generic [ref=f56e91]:
    - text: EditDefaults40 Alphatask-040 Default edit secondOpenLow
    - group [ref=f56e93]:
      - button "Open project" [ref=f56e94]
  - generic [ref=f56e95]:
    - text: EditDefaults40 Zulutask-040 Default edit firstCompletedHigh3260-03-01 Defaults Ω kept
    - group [ref=f56e97]:
      - button "Open project" [ref=f56e98]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | import {rows,owners,titles,result,directory,returnTo,configured,range,query,download,workspace,fieldStored,protectedWrites} from './directory-presence-helpers.mjs';
  4  | const mode=p=>p.getByRole('combobox',{name:'Directory search mode',exact:true});
  5  | async function controls(p,q){await expect(mode(p).locator('option:checked')).toHaveText('Starts with');await expect(p.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q);}
  6  | const defaults=p=>p.getByRole('combobox',{name:'Default task priority',exact:true});
  7  | async function defaultStored(p,owner,value){const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return defaults(o).locator('option:checked').textContent();}).toBe(value);}finally{await o.close();}}
  8  | async function project(p,owner,value='Normal'){await createProject(p,owner);await openProject(p,owner);if(value!=='Normal'){await defaults(p).selectOption({label:value});await defaultStored(p,owner,value);await returnTo(p,owner);}}
  9  | const archive=p=>p.getByRole('button',{name:'Archive visible projects',exact:true});
  10 | const restore=p=>p.getByRole('button',{name:'Restore visible projects',exact:true});
  11 | async function scope(p,value){await p.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:value});}
  12 | async function full(p,name,archived=false){const o=await p.context().newPage();try{await o.goto('/');await o.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:archived?'Archived':'Active'});await openProject(o,name);return await download(o);}finally{await o.close();}}
  13 | const value=p=>p.getByRole('combobox',{name:'Visible projects default priority',exact:true});
  14 | const assign=p=>p.getByRole('button',{name:'Set visible project default',exact:true});
  15 | const ownerFilter=p=>p.getByRole('combobox',{name:'Project default priority',exact:true});
  16 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  17 | if(stage>=40){
  18 | 
  19 |  test('138 default assignment uses the initial represented owners and preserves all existing tasks and defaults elsewhere',async({page})=>{
> 20 |   test.setTimeout(180000);const a='Default edit first',b='Default edit second',c='Default edit excluded',q='EditDefaults'+stage,one=q+' Zulu',two=q+' Alpha',extra='Excluded edit literal '+stage;await project(page,a,'Low');await configured(page,a,one,{priority:'High',date:String(3220+stage)+'-03-01',notes:'  Defaults Ω\nkept  ',completed:true});await configured(page,a,extra,{priority:'Low',notes:'Deleted excluded',deleted:true});await project(page,b,'Low');await configured(page,b,two,{priority:'Normal'});await project(page,c,'Low');await configured(page,c,'Different edit '+stage,{priority:'High',notes:q});const docs=[await full(page,a),await full(page,b),await full(page,c)];await directory(page,q,one);await result(page,[a,b],['1/1 completed','0/1 completed'],[one,two],'1/2 completed');await expect(value(page).locator('option')).toHaveText(['Low','Normal','High']);await expect(value(page).locator('option:checked')).toHaveText('Normal');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['1/1 completed','0/1 completed'],[two,one],'1/2 completed');await ownerFilter(page).selectOption({label:'Normal'});await result(page,[],[],[],'0/0 completed');await ownerFilter(page).selectOption({label:'Low'});await result(page,[a,b],['1/1 completed','0/1 completed'],[two,one],'1/2 completed');await value(page).selectOption({label:'High'});await assign(page).click();await result(page,[],[],[],'0/0 completed');await expect(assign(page)).toBeDisabled();await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q);await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText('Title');await ownerFilter(page).selectOption({label:'High'});await result(page,[a,b],['1/1 completed','0/1 completed'],[two,one],'1/2 completed');for(const [i,name] of [a,b].entries())expect(await full(page,name)).toEqual({...docs[i],defaultPriority:'High'});expect(await full(page,c)).toEqual(docs[2]);await value(page).selectOption({label:'Normal'});await assign(page).click();await result(page,[],[],[],'0/0 completed');await ownerFilter(page).selectOption({label:'Normal'});await result(page,[a,b],['1/1 completed','0/1 completed'],[two,one],'1/2 completed');expect((await workspace(page)).map(p=>p.defaultPriority)).toEqual(['Normal','Normal']);for(const name of [a,b]){await returnTo(page,name);await createTask(page,'New assigned '+stage);await expectPersistedPriority(page,name,'New assigned '+stage,'Normal');}
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ^ Error: expect(received).toEqual(expected) // deep equality
  21 |  });
  22 |  test('139 duplicate owners stay independent and default editing includes Deleted matches but protects Archived scope',async({page})=>{
  23 |   test.setTimeout(120000);const a='Default edit duplicate',q='DefaultDuplicate'+stage,live=q+' live',deleted=q+' deleted',guard='Default duplicate guard '+stage,archived=q+' archived';const mk=(title,deleted)=>({title,completed:false,priority:'High',dueDate:'',notes:'  Default duplicate Ω\nkept  ',deleted});const docs=[{name:projectName(a),archived:false,defaultPriority:'Low',tasks:[mk(live,false)]},{name:projectName(a),archived:false,defaultPriority:'Low',tasks:[mk(deleted,true)]},{name:projectName(a),archived:false,defaultPriority:'Low',tasks:[mk(guard,false)]},{name:projectName(a),archived:true,defaultPriority:'Low',tasks:[mk(archived,false)]}];await page.goto('/');await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify({format:'workboard-workspace',version:1,projects:docs}));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await expect(projectRow(page,a)).toHaveCount(3);await directory(page,q,live);await result(page,[a],['0/1 completed'],[live],'0/1 completed');await ownerFilter(page).selectOption({label:'Normal'});await result(page,[],[],[],'0/0 completed');await ownerFilter(page).selectOption({label:'Low'});await result(page,[a],['0/1 completed'],[live],'0/1 completed');await value(page).selectOption({label:'High'});await assign(page).click();await result(page,[],[],[],'0/0 completed');await ownerFilter(page).selectOption({label:'High'});await result(page,[a],['0/1 completed'],[live],'0/1 completed');const changed=await workspace(page);expect(changed).toEqual([{...docs[0],defaultPriority:'High'}]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[],[],[],'0/0 completed');await ownerFilter(page).selectOption({label:'Low'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');await protectedWrites(page);await expect(assign(page)).toBeEnabled();await value(page).selectOption({label:'Normal'});await assign(page).click();await result(page,[],[],[],'0/0 completed');await ownerFilter(page).selectOption({label:'Normal'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');expect(await workspace(page)).toEqual([{...docs[1],defaultPriority:'Normal'}]);await ownerFilter(page).selectOption({label:'Low'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[],[],[],'0/0 completed');await query(page,guard);await result(page,[a],['0/1 completed'],[guard],'0/1 completed');expect(await workspace(page)).toEqual([docs[2]]);await query(page,q);await result(page,[],[],[],'0/0 completed');await scope(page,'Archived');await result(page,[a],['0/1 completed'],[archived],'0/1 completed');await expect(assign(page)).toBeDisabled();await protectedWrites(page);expect(await workspace(page)).toEqual([docs[3]]);
  24 |  });
  25 |  test('140 owner default assignment honors every current filter without changing task priorities',async({page})=>{
  26 |   test.setTimeout(180000);const q='DefaultFilters'+stage,date=String(3240+stage)+'-03-01',names=['Default matching','Default wrong prefix','Default wrong default','Default wrong priority','Default wrong date','Default wrong notes','Default wrong completion'],ts=names.map((_,i)=>(i===1?'embedded ':'')+q+' '+i);for(const [i,name] of names.entries()){await project(page,name,i===2?'Low':'High');await configured(page,name,ts[i],{priority:i===3?'High':'Low',date:i===4?'':date,notes:i===5?'':'  Filter Ω\nkept  ',completed:i!==6});}const docs=[];for(const name of names)docs.push(await full(page,name));await directory(page,q,ts[0]);await result(page,names,names.map((_,i)=>i===6?'0/1 completed':'1/1 completed'),ts,'6/7 completed');await mode(page).selectOption({label:'Starts with'});await result(page,names.filter((_,i)=>i!==1),['1/1 completed','1/1 completed','1/1 completed','1/1 completed','1/1 completed','0/1 completed'],ts.filter((_,i)=>i!==1),'5/6 completed');await page.getByRole('combobox',{name:'Project default priority',exact:true}).selectOption({label:'High'});await expect(rows(page)).toHaveCount(5);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await expect(rows(page)).toHaveCount(4);await page.getByRole('combobox',{name:'Directory due status',exact:true}).selectOption({label:'Dated'});await expect(rows(page)).toHaveCount(3);await range(page,String(3240+stage)+'-03-02');await result(page,[],[],[],'0/0 completed');await range(page,date);await expect(rows(page)).toHaveCount(3);await page.getByRole('combobox',{name:'Directory notes status',exact:true}).selectOption({label:'Present'});await expect(rows(page)).toHaveCount(2);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[names[0]],['1/1 completed'],[ts[0]],'1/1 completed');await value(page).selectOption({label:'Normal'});await assign(page).click();await result(page,[],[],[],'0/0 completed');await controls(page,q);await ownerFilter(page).selectOption({label:'Normal'});await result(page,[names[0]],['1/1 completed'],[ts[0]],'1/1 completed');expect(await workspace(page)).toEqual([{...docs[0],defaultPriority:'Normal'}]);for(const [i,name] of names.entries())expect(await full(page,name)).toEqual(i===0?{...docs[i],defaultPriority:'Normal'}:docs[i]);
  27 |  });
  28 |  test('141 assigning defaults leaves task metadata and both remembered positions unchanged',async({page})=>{
  29 |   test.setTimeout(180000);const a='Default restart first',b='Default restart second',travel='DefaultRestart'+stage+' travelling-default'+stage,before='Default before '+stage,after='Default after '+stage,hold='Default hold '+stage,later='Default later '+stage,date=String(3260+stage)+'-03-01',notes='  Default restart Ω\nkept  ';
  30 |   await project(page,a,'High');await createTask(page,before);await configured(page,a,travel,{priority:'High',date,completed:true});await createTask(page,after);await project(page,b,'Low');await createTask(page,hold);
  31 |   async function move(source,target,sourceOrder,targetOrder){await returnTo(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const o=await page.context().newPage();try{await returnTo(o,target);await titles(o,targetOrder);await returnTo(o,source);await titles(o,sourceOrder);}finally{await o.close();}}
  32 |   await move(a,b,[before,after],[hold,travel]);await returnTo(page,b);await createTask(page,later);await directory(page,travel,travel);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await query(page,'AbsentPrefix'+stage);await result(page,[],[],[],'0/0 completed');await query(page,'travelling-default'+stage);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[],[],[],'0/0 completed');await query(page,travel);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(notes);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([notes]);await fieldStored(page,b,travel,'Task notes',notes);await controls(page,travel);const exported=await workspace(page);expect(exported[0].tasks).toEqual([{title:travel,completed:true,priority:'High',dueDate:date,notes,deleted:false}]);await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await defaults(page).selectOption({label:'Normal'});await defaultStored(page,a,'Normal');await expectPersistedPriority(page,a,travel,'High');
  33 |   await directory(page,travel,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await query(page,'AbsentPrefix'+stage);await result(page,[],[],[],'0/0 completed');await query(page,'travelling-default'+stage);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[],[],[],'0/0 completed');await query(page,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await ownerFilter(page).selectOption({label:'High'});await result(page,[],[],[],'0/0 completed');await ownerFilter(page).selectOption({label:'Normal'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await value(page).selectOption({label:'Low'});await assign(page).click();await result(page,[],[],[],'0/0 completed');await ownerFilter(page).selectOption({label:'Low'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');expect((await workspace(page))[0]).toMatchObject({defaultPriority:'Low',tasks:[{title:travel,completed:true,priority:'High',dueDate:date,notes,deleted:false}]});await move(a,b,[before,after],[hold,travel,later]);await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(notes);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expectPersistedCompletion(page,a,travel,true);
  34 |  });
  35 | }
  36 | 
```