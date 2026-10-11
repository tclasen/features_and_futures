# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-prefix-search.spec.mjs >> 132 every bulk action and matching export honor prefix and protect embedded matches
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task038-executed04-suite/directory-prefix-search.spec.mjs:19:2

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  0
+ Received  + 15

@@ -13,6 +13,21 @@
          "priority": "Low",
          "title": "PrefixBulk38 target",
        },
      ],
    },
+   Object {
+     "archived": false,
+     "defaultPriority": "Low",
+     "name": "task-038 Owner bulk low",
+     "tasks": Array [
+       Object {
+         "completed": true,
+         "deleted": false,
+         "dueDate": "",
+         "notes": "",
+         "priority": "High",
+         "title": "embedded PrefixBulk38 guard",
+       },
+     ],
+   },
  ]
```

# Page snapshot

```yaml
- generic [ref=f41e1]:
  - heading "Task directory" [level=1] [ref=f41e2]
  - text: 0/1 completed
  - generic [ref=f41e3]:
    - text: task-038 Owner bulk high0/1 completed
    - group [ref=f41e5]:
      - button "Open project" [ref=f41e6]
  - group [ref=f41e8]:
    - button "Complete visible tasks" [ref=f41e9]
  - group [ref=f41e11]:
    - button "Reopen visible tasks" [disabled] [ref=f41e12]
  - group [ref=f41e14]:
    - button "Delete visible tasks" [ref=f41e15]
  - group [ref=f41e17]:
    - button "Restore visible tasks" [disabled] [ref=f41e18]
  - group [ref=f41e20]:
    - generic [ref=f41e21]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f41e22]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f41e23]
  - group [ref=f41e25]:
    - generic [ref=f41e26]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f41e27]
    - button "Save visible due date" [ref=f41e28]
  - group [ref=f41e30]:
    - generic [ref=f41e31]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f41e32]
    - button "Save visible notes" [ref=f41e33]
  - group [ref=f41e35]:
    - button "Export matching workspace" [active] [ref=f41e36]
  - group [ref=f41e38]:
    - button "Projects" [ref=f41e39]
  - generic [ref=f41e41]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f41e42]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f41e44]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f41e45]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f41e47]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f41e48]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f41e50]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f41e51]:
      - option "Phrase"
      - option "All words"
      - option "Any words"
      - option "Starts with" [selected]
  - generic [ref=f41e53]:
    - text: Directory order
    - combobox "Directory order" [ref=f41e54]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f41e56]:
    - text: Project scope
    - combobox "Project scope" [ref=f41e57]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f41e59]:
    - text: Task filter
    - combobox "Task filter" [ref=f41e60]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f41e62]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f41e63]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f41e65]:
    - generic [ref=f41e66]:
      - text: Directory search
      - textbox "Directory search" [ref=f41e67]: PrefixBulk38
    - button "Search directory" [ref=f41e68]
  - group [ref=f41e70]:
    - generic [ref=f41e71]:
      - text: Due from
      - textbox "Due from" [ref=f41e72]
    - generic [ref=f41e73]:
      - text: Due through
      - textbox "Due through" [ref=f41e74]
    - button "Apply due range" [ref=f41e75]
  - generic [ref=f41e76]:
    - text: PrefixBulk38 targettask-038 Owner bulk highOpenLow3058-03-01 Owner bulk Ω kept
    - group [ref=f41e78]:
      - button "Open project" [ref=f41e79]
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
  9  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  10 | if(stage>=38){
  11 | 
  12 |  test('130 Starts with matches the whole normalized prefix and preserves other modes filters and order',async({page})=>{
  13 |   test.setTimeout(120000);const a='Prefix modes owner',x='Prefix'+stage,y='Birch'+stage,q=x+' '+y,date=String(3100+stage)+'-03-01';const ts=[q+' first','before '+q+' embedded',x+' gap '+y,y+' '+x,x+y+' joined',x+' only','Neither'+stage];
  14 |   await project(page,a);for(const title of ts)await configured(page,a,title,{date,notes:title===ts[6]?q:''});await directory(page,q,ts[0]);await result(page,[a],['0/2 completed'],ts.slice(0,2),'0/2 completed');await expect(mode(page).locator('option')).toHaveText(['Phrase','All words','Any words','Starts with']);await mode(page).selectOption({label:'Starts with'});await result(page,[a],['0/1 completed'],[ts[0]],'0/1 completed');await query(page,'  '+x.toLowerCase()+'\t '+y.toUpperCase()+'  ');await result(page,[a],['0/1 completed'],[ts[0]],'0/1 completed');await range(page,String(3100+stage)+'-03-02');await result(page,[],[],[],'0/0 completed');await range(page,date);await result(page,[a],['0/1 completed'],[ts[0]],'0/1 completed');await query(page,' \t ');await result(page,[a],['0/7 completed'],ts,'0/7 completed');await query(page,q);await result(page,[a],['0/1 completed'],[ts[0]],'0/1 completed');await mode(page).selectOption({label:'All words'});await result(page,[a],['0/5 completed'],ts.slice(0,5),'0/5 completed');await mode(page).selectOption({label:'Any words'});await result(page,[a],['0/6 completed'],ts.slice(0,6),'0/6 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[a],['0/1 completed'],[ts[0]],'0/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a],['0/1 completed'],[ts[0]],'0/1 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a],['0/1 completed'],[ts[0]],'0/1 completed');await controls(page,q);await returnTo(page,a);expect((await download(page)).tasks.map(t=>t.title)).toEqual(ts);
  15 |  });
  16 |  test('131 prefix normalization is ASCII only and punctuation remains literal',async({page})=>{
  17 |   test.setTimeout(120000);const a='Prefix literals owner',x='AshPrefix'+stage,y='BeePrefix'+stage,date=String(3120+stage)+'-03-01',rx='RegexPrefix'+stage+'.*';const ts=[x+'\u00a0'+y+' NBSP',x+' '+y+' ASCII',x+'\t'+y+' TAB','ÄPrefix'+stage+' upper','äPrefix'+stage+' lower',rx+' literal','RegexPrefix'+stage+'zzz decoy'];await project(page,a);for(const title of ts)await configured(page,a,title,{date});await directory(page,x+' '+y,ts[1]);await result(page,[a],['0/2 completed'],[ts[1],ts[2]],'0/2 completed');await query(page,' ASCII');await result(page,[a],['0/1 completed'],[ts[1]],'0/1 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[],[],[],'0/0 completed');await query(page,x+' '+y);await result(page,[a],['0/2 completed'],[ts[1],ts[2]],'0/2 completed');await query(page,x+'\u00a0'+y);await result(page,[a],['0/1 completed'],[ts[0]],'0/1 completed');await query(page,'äPREFIX'+stage);await result(page,[a],['0/1 completed'],[ts[4]],'0/1 completed');await query(page,'ÄPREFIX'+stage);await result(page,[a],['0/1 completed'],[ts[3]],'0/1 completed');await query(page,rx);await result(page,[a],['0/1 completed'],[ts[5]],'0/1 completed');expect((await workspace(page))[0].tasks[0].title).toBe(ts[5]);await returnTo(page,a);expect((await download(page)).tasks.map(t=>t.title)).toEqual(ts);
  18 |  });
  19 |  test('132 every bulk action and matching export honor prefix and protect embedded matches',async({page})=>{
  20 |   test.setTimeout(180000);const a='Owner bulk high',b='Owner bulk low',q='PrefixBulk'+stage,target=q+' target',guard='embedded '+q+' guard',deleted='embedded '+q+' protected deleted',date=String(3020+stage)+'-03-01',notes='  Owner bulk Ω\nkept  ';
  21 |   await project(page,a,'High');await configured(page,a,target,{priority:'High'});await project(page,b,'Low');await configured(page,b,guard,{priority:'High'});await configured(page,b,deleted,{priority:'High',date,notes:'Protected',deleted:true});await directory(page,q,target);await result(page,[a,b],['0/1 completed','0/1 completed'],[target,guard],'0/2 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');
  22 |   await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();await result(page,[a],['1/1 completed'],[target],'1/1 completed');await expectPersistedCompletion(page,a,target,true);await expectPersistedCompletion(page,b,guard,false);const o=await page.context().newPage();try{await returnTo(o,b);await o.getByRole('checkbox',{name:'Complete '+guard,exact:true}).check();await expectPersistedCompletion(o,b,guard,true);}finally{await o.close();}
  23 |   await page.getByRole('button',{name:'Reopen visible tasks',exact:true}).click();await result(page,[a],['0/1 completed'],[target],'0/1 completed');await expectPersistedCompletion(page,b,guard,true);await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await expect(rows(page).getByTestId('directory-task-priority')).toHaveText(['Low']);await expectPersistedPriority(page,a,target,'Low');await expectPersistedPriority(page,b,guard,'High');await controls(page,q);
> 24 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(date);await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await expect(rows(page).getByTestId('directory-task-due-date')).toHaveText([date]);await fieldStored(page,b,guard,'Task due date','');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(notes);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([notes]);await fieldStored(page,b,guard,'Task notes','');expect(await workspace(page)).toEqual([{name:projectName(a),archived:false,defaultPriority:'High',tasks:[{title:target,completed:false,priority:'Low',dueDate:date,notes,deleted:false}]}]);
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 ^ Error: expect(received).toEqual(expected) // deep equality
  25 |   await page.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');await protectedWrites(page);await page.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await mode(page).selectOption({label:'Phrase'});await result(page,[b],['0/1 completed'],[deleted],'0/1 completed');await defaultStored(page,a,'High');await defaultStored(page,b,'Low');
  26 |   await returnTo(page,b);expect((await download(page)).tasks).toEqual([{title:guard,completed:true,priority:'High',dueDate:'',notes:'',deleted:false},{title:deleted,completed:false,priority:'High',dueDate:date,notes:'Protected',deleted:true}]);await returnTo(page,a);await createTask(page,'New inherited high');await expectPersistedPriority(page,a,'New inherited high','High');
  27 |  });
  28 |  test('133 prefix views and exports preserve literal metadata and both remembered positions',async({page})=>{
  29 |   test.setTimeout(180000);const a='Prefix restart first',b='Prefix restart second',travel='PrefixRestart'+stage+' travelling-prefix'+stage,before='Prefix before '+stage,after='Prefix after '+stage,hold='Prefix hold '+stage,later='Prefix later '+stage,date=String(3140+stage)+'-03-01',notes='  Prefix restart Ω\nkept  ';
  30 |   await project(page,a,'High');await createTask(page,before);await configured(page,a,travel,{priority:'High',date,completed:true});await createTask(page,after);await project(page,b,'Low');await createTask(page,hold);
  31 |   async function move(source,target,sourceOrder,targetOrder){await returnTo(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const o=await page.context().newPage();try{await returnTo(o,target);await titles(o,targetOrder);await returnTo(o,source);await titles(o,sourceOrder);}finally{await o.close();}}
  32 |   await move(a,b,[before,after],[hold,travel]);await returnTo(page,b);await createTask(page,later);await directory(page,travel,travel);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await query(page,'AbsentPrefix'+stage);await result(page,[],[],[],'0/0 completed');await query(page,'travelling-prefix'+stage);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[],[],[],'0/0 completed');await query(page,travel);await result(page,[b],['1/1 completed'],[travel],'1/1 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(notes);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([notes]);await fieldStored(page,b,travel,'Task notes',notes);await controls(page,travel);const exported=await workspace(page);expect(exported[0].tasks).toEqual([{title:travel,completed:true,priority:'High',dueDate:date,notes,deleted:false}]);await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await defaults(page).selectOption({label:'Normal'});await defaultStored(page,a,'Normal');await expectPersistedPriority(page,a,travel,'High');
  33 |   await directory(page,travel,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await query(page,'AbsentPrefix'+stage);await result(page,[],[],[],'0/0 completed');await query(page,'travelling-prefix'+stage);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await mode(page).selectOption({label:'Starts with'});await result(page,[],[],[],'0/0 completed');await query(page,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await move(a,b,[before,after],[hold,travel,later]);await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(notes);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expectPersistedCompletion(page,a,travel,true);
  34 |  });
  35 | }
  36 | 
```