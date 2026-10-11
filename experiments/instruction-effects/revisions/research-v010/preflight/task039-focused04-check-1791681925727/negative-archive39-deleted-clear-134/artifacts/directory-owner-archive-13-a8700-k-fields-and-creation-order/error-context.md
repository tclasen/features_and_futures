# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owner-archive.spec.mjs >> 134 archive and restore each represented owner while preserving all excluded task fields and creation order
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task039-executed04-suite/directory-owner-archive.spec.mjs:16:2

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

@@ -12,11 +12,11 @@
        "priority": "Low",
        "title": "ArchiveOwners39 Zulu",
      },
      Object {
        "completed": false,
-       "deleted": true,
+       "deleted": false,
        "dueDate": "",
        "notes": "Literal excluded",
        "priority": "High",
        "title": "Excluded metadata 39",
      },
```

# Page snapshot

```yaml
- generic [active] [ref=f58e1]:
  - heading "Task directory" [level=1] [ref=f58e2]
  - text: 2/3 completed
  - generic [ref=f58e3]:
    - text: task-039 Archive first owner1/1 completed
    - group [ref=f58e5]:
      - button "Open project" [ref=f58e6]
  - generic [ref=f58e7]:
    - text: task-039 Archive second owner1/2 completed
    - group [ref=f58e9]:
      - button "Open project" [ref=f58e10]
  - group [ref=f58e12]:
    - button "Complete visible tasks" [disabled] [ref=f58e13]
  - group [ref=f58e15]:
    - button "Reopen visible tasks" [disabled] [ref=f58e16]
  - group [ref=f58e18]:
    - button "Delete visible tasks" [disabled] [ref=f58e19]
  - group [ref=f58e21]:
    - button "Restore visible tasks" [disabled] [ref=f58e22]
  - group [ref=f58e24]:
    - generic [ref=f58e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f58e26]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f58e27]
  - group [ref=f58e29]:
    - generic [ref=f58e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f58e31]
    - button "Save visible due date" [disabled] [ref=f58e32]
  - group [ref=f58e34]:
    - generic [ref=f58e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [disabled] [ref=f58e36]
    - button "Save visible notes" [disabled] [ref=f58e37]
  - group [ref=f58e39]:
    - button "Archive visible projects" [disabled] [ref=f58e40]
  - group [ref=f58e42]:
    - button "Restore visible projects" [ref=f58e43]
  - group [ref=f58e45]:
    - button "Export matching workspace" [ref=f58e46]
  - group [ref=f58e48]:
    - button "Projects" [ref=f58e49]
  - generic [ref=f58e51]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f58e52]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f58e54]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f58e55]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f58e57]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f58e58]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f58e60]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f58e61]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
      - option "Starts with"
  - generic [ref=f58e63]:
    - text: Directory order
    - combobox "Directory order" [ref=f58e64]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f58e66]:
    - text: Project scope
    - combobox "Project scope" [ref=f58e67]:
      - option "Active"
      - option "Archived" [selected]
  - generic [ref=f58e69]:
    - text: Task filter
    - combobox "Task filter" [ref=f58e70]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f58e72]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f58e73]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f58e75]:
    - generic [ref=f58e76]:
      - text: Directory search
      - textbox "Directory search" [ref=f58e77]: ArchiveOwners39
    - button "Search directory" [ref=f58e78]
  - group [ref=f58e80]:
    - generic [ref=f58e81]:
      - text: Due from
      - textbox "Due from" [ref=f58e82]
    - generic [ref=f58e83]:
      - text: Due through
      - textbox "Due through" [ref=f58e84]
    - button "Apply due range" [ref=f58e85]
  - generic [ref=f58e86]:
    - text: ArchiveOwners39 Alphatask-039 Archive second ownerOpenHigh
    - group [ref=f58e88]:
      - button "Open project" [ref=f58e89]
  - generic [ref=f58e90]:
    - text: ArchiveOwners39 Middletask-039 Archive second ownerCompletedLow
    - group [ref=f58e92]:
      - button "Open project" [ref=f58e93]
  - generic [ref=f58e94]:
    - text: ArchiveOwners39 Zulutask-039 Archive first ownerCompletedLow3199-03-01 Archive Ω kept
    - group [ref=f58e96]:
      - button "Open project" [ref=f58e97]
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
  13 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  14 | if(stage>=39){
  15 | 
  16 |  test('134 archive and restore each represented owner while preserving all excluded task fields and creation order',async({page})=>{
  17 |   test.setTimeout(180000);const a='Archive first owner',b='Archive second owner',c='Archive excluded owner',d='Archive empty owner',q='ArchiveOwners'+stage,date=String(3160+stage)+'-03-01',one=q+' Zulu',two=q+' Alpha',three=q+' Middle',guard='Excluded metadata '+stage;
  18 |   await project(page,a,'High');await configured(page,a,one,{priority:'Low',date,notes:'  Archive Ω\nkept  ',completed:true});await configured(page,a,guard,{priority:'High',notes:'Literal excluded',deleted:true});await project(page,b,'Low');await configured(page,b,two,{priority:'High'});await configured(page,b,three,{priority:'Normal',completed:true});await project(page,c);await configured(page,c,'Nonmatching '+stage,{notes:q});await project(page,d);const originals=[await full(page,a),await full(page,b),await full(page,c),await full(page,d)];
> 19 |   await directory(page,q,one);await result(page,[a,b],['1/1 completed','1/2 completed'],[one,two,three],'2/3 completed');await expect(archive(page)).toBeEnabled();await expect(restore(page)).toBeDisabled();await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['1/1 completed','1/2 completed'],[two,three,one],'2/3 completed');await archive(page).click();await result(page,[],[],[],'0/0 completed');await expect(archive(page)).toBeDisabled();await expect(restore(page)).toBeDisabled();await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q);await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText('Title');await scope(page,'Archived');await result(page,[a,b],['1/1 completed','1/2 completed'],[two,three,one],'2/3 completed');await expect(archive(page)).toBeDisabled();await expect(restore(page)).toBeEnabled();await protectedWrites(page);for(const [i,name] of [a,b].entries())expect(await full(page,name,true)).toEqual({...originals[i],archived:true});expect(await full(page,c)).toEqual(originals[2]);expect(await full(page,d)).toEqual(originals[3]);await restore(page).click();await result(page,[],[],[],'0/0 completed');await expect(restore(page)).toBeDisabled();await scope(page,'Active');await result(page,[a,b],['1/1 completed','1/2 completed'],[two,three,one],'2/3 completed');for(const [i,name] of [a,b,c,d].entries())expect(await full(page,name)).toEqual(originals[i]);
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ^ Error: expect(received).toEqual(expected) // deep equality
  20 |  });
  21 |  test('135 duplicate names remain distinct and Deleted matches still represent an owner',async({page})=>{
  22 |   test.setTimeout(120000);const a='Archive duplicate',q='ArchiveDuplicate'+stage,target=q+' deleted',guard='Duplicate excluded '+stage,archived=q+' archived live';const mk=(title,deleted)=>({title,completed:false,priority:'High',dueDate:'',notes:'  Duplicate Ω\nkept  ',deleted});const docs=[{name:projectName(a),archived:false,defaultPriority:'Low',tasks:[mk(target,true)]},{name:projectName(a),archived:false,defaultPriority:'High',tasks:[mk(guard,false)]},{name:projectName(a),archived:true,defaultPriority:'Normal',tasks:[mk(archived,false)]}];await page.goto('/');await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify({format:'workboard-workspace',version:1,projects:docs}));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await expect(projectRow(page,a)).toHaveCount(2);await directory(page,q,archived===target?target:guard);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');await protectedWrites(page);await expect(archive(page)).toBeEnabled();expect(await workspace(page)).toEqual([docs[0]]);await archive(page).click();await result(page,[],[],[],'0/0 completed');await scope(page,'Archived');await result(page,[a],['0/1 completed'],[target],'0/1 completed');expect(await workspace(page)).toEqual([{...docs[0],archived:true}]);await restore(page).click();await result(page,[],[],[],'0/0 completed');await scope(page,'Active');await result(page,[a],['0/1 completed'],[target],'0/1 completed');expect(await workspace(page)).toEqual([docs[0]]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[],[],[],'0/0 completed');await query(page,guard);await result(page,[a],['0/1 completed'],[guard],'0/1 completed');expect(await workspace(page)).toEqual([docs[1]]);await query(page,q);await result(page,[],[],[],'0/0 completed');await scope(page,'Archived');await result(page,[a],['0/1 completed'],[archived],'0/1 completed');expect(await workspace(page)).toEqual([docs[2]]);
  23 |  });
  24 |  test('136 owner mutation honors every current matching filter and keeps archived task writes protected',async({page})=>{
  25 |   test.setTimeout(180000);const q='ArchiveFilters'+stage,date=String(3180+stage)+'-03-01',names=['Archive matching','Archive wrong prefix','Archive wrong default','Archive wrong priority','Archive wrong date','Archive wrong notes','Archive wrong completion'],ts=names.map((_,i)=>(i===1?'embedded ':'')+q+' '+i);for(const [i,name] of names.entries()){await project(page,name,i===2?'Low':'High');await configured(page,name,ts[i],{priority:i===3?'High':'Low',date:i===4?'':date,notes:i===5?'':'  Filter Ω\nkept  ',completed:i!==6});}const docs=[];for(const name of names)docs.push(await full(page,name));await directory(page,q,ts[0]);await result(page,names,names.map((_,i)=>i===6?'0/1 completed':'1/1 completed'),ts,'6/7 completed');await mode(page).selectOption({label:'Starts with'});await result(page,names.filter((_,i)=>i!==1),['1/1 completed','1/1 completed','1/1 completed','1/1 completed','1/1 completed','0/1 completed'],ts.filter((_,i)=>i!==1),'5/6 completed');await page.getByRole('combobox',{name:'Project default priority',exact:true}).selectOption({label:'High'});await expect(rows(page)).toHaveCount(5);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await expect(rows(page)).toHaveCount(4);await page.getByRole('combobox',{name:'Directory due status',exact:true}).selectOption({label:'Dated'});await expect(rows(page)).toHaveCount(3);await range(page,String(3180+stage)+'-03-02');await result(page,[],[],[],'0/0 completed');await range(page,date);await expect(rows(page)).toHaveCount(3);await page.getByRole('combobox',{name:'Directory notes status',exact:true}).selectOption({label:'Present'});await expect(rows(page)).toHaveCount(2);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[names[0]],['1/1 completed'],[ts[0]],'1/1 completed');await archive(page).click();await result(page,[],[],[],'0/0 completed');await controls(page,q);await scope(page,'Archived');await result(page,[names[0]],['1/1 completed'],[ts[0]],'1/1 completed');await protectedWrites(page);expect(await workspace(page)).toEqual([{...docs[0],archived:true}]);for(let i=1;i<names.length;i++)expect(await full(page,names[i])).toEqual(docs[i]);await restore(page).click();await result(page,[],[],[],'0/0 completed');for(const [i,name] of names.entries())expect(await full(page,name)).toEqual(docs[i]);
  26 |  });
  27 |  test('137 owner archive and restore retain both reserved positions and restart metadata',async({page})=>{
  28 |   test.setTimeout(180000);const a='Archive restart first',b='Archive restart second',travel='ArchiveRestart'+stage+' travelling-archive'+stage,before='Archive before '+stage,after='Archive after '+stage,hold='Archive hold '+stage,later='Archive later '+stage,date=String(3200+stage)+'-03-01',notes='  Archive restart Ω\nkept  ';
  29 |   await project(page,a,'High');await createTask(page,before);await configured(page,a,travel,{priority:'High',date,completed:true});await createTask(page,after);await project(page,b,'Low');await createTask(page,hold);
  30 |   async function move(source,target,sourceOrder,targetOrder){await returnTo(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const o=await page.context().newPage();try{await returnTo(o,target);await titles(o,targetOrder);await returnTo(o,source);await titles(o,sourceOrder);}finally{await o.close();}}
  31 |   await move(a,b,[before,after],[hold,travel]);await returnTo(page,b);await createTask(page,later);await directory(page,travel,travel);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await query(page,'AbsentPrefix'+stage);await result(page,[],[],[],'0/0 completed');await query(page,'travelling-archive'+stage);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[],[],[],'0/0 completed');await query(page,travel);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(notes);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([notes]);await fieldStored(page,b,travel,'Task notes',notes);await controls(page,travel);const exported=await workspace(page);expect(exported[0].tasks).toEqual([{title:travel,completed:true,priority:'High',dueDate:date,notes,deleted:false}]);await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await defaults(page).selectOption({label:'Normal'});await defaultStored(page,a,'Normal');await expectPersistedPriority(page,a,travel,'High');
  32 |   await directory(page,travel,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await query(page,'AbsentPrefix'+stage);await result(page,[],[],[],'0/0 completed');await query(page,'travelling-archive'+stage);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[],[],[],'0/0 completed');await query(page,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await archive(page).click();await result(page,[],[],[],'0/0 completed');await scope(page,'Archived');await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await protectedWrites(page);expect((await workspace(page))[0].tasks).toEqual([{title:travel,completed:true,priority:'High',dueDate:date,notes,deleted:false}]);await restore(page).click();await result(page,[],[],[],'0/0 completed');await scope(page,'Active');await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await move(a,b,[before,after],[hold,travel,later]);await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(notes);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expectPersistedCompletion(page,a,travel,true);
  33 |  });
  34 | }
  35 | 
```