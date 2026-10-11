# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-notes-status.spec.mjs >> 123 notes presence alone selects each bulk write and assignment or clear changes membership
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task036-executed02-suite/directory-notes-status.spec.mjs:20:2

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 0
+ Received  + 1

  Array [
    "NotesIndependent36 empty",
+   "NotesIndependent36 present",
  ]
```

# Page snapshot

```yaml
- generic [ref=f36e1]:
  - heading "Task directory" [level=1] [ref=f36e2]
  - text: 0/1 completed
  - generic [ref=f36e3]:
    - text: task-036 Notes independent bulk0/1 completed
    - group [ref=f36e5]:
      - button "Open project" [ref=f36e6]
  - group [ref=f36e8]:
    - button "Complete visible tasks" [ref=f36e9]
  - group [ref=f36e11]:
    - button "Reopen visible tasks" [disabled] [ref=f36e12]
  - group [ref=f36e14]:
    - button "Delete visible tasks" [ref=f36e15]
  - group [ref=f36e17]:
    - button "Restore visible tasks" [disabled] [ref=f36e18]
  - group [ref=f36e20]:
    - generic [ref=f36e21]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f36e22]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f36e23]
  - group [ref=f36e25]:
    - generic [ref=f36e26]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f36e27]
    - button "Save visible due date" [ref=f36e28]
  - group [ref=f36e30]:
    - generic [ref=f36e31]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f36e32]
    - button "Save visible notes" [ref=f36e33]
  - group [ref=f36e35]:
    - button "Export matching workspace" [active] [ref=f36e36]
  - group [ref=f36e38]:
    - button "Projects" [ref=f36e39]
  - generic [ref=f36e41]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f36e42]:
      - option "All"
      - option "Empty"
      - option "Present" [selected]
  - generic [ref=f36e44]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f36e45]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f36e47]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f36e48]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f36e50]:
    - text: Directory order
    - combobox "Directory order" [ref=f36e51]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f36e53]:
    - text: Project scope
    - combobox "Project scope" [ref=f36e54]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f36e56]:
    - text: Task filter
    - combobox "Task filter" [ref=f36e57]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f36e59]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f36e60]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f36e62]:
    - generic [ref=f36e63]:
      - text: Directory search
      - textbox "Directory search" [ref=f36e64]: NotesIndependent36
    - button "Search directory" [ref=f36e65]
  - group [ref=f36e67]:
    - generic [ref=f36e68]:
      - text: Due from
      - textbox "Due from" [ref=f36e69]
    - generic [ref=f36e70]:
      - text: Due through
      - textbox "Due through" [ref=f36e71]
    - button "Apply due range" [ref=f36e72]
  - generic [ref=f36e73]:
    - text: NotesIndependent36 emptytask-036 Notes independent bulkOpenLow2956-03-01
    - group [ref=f36e75]:
      - button "Open project" [ref=f36e76]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | import {rows,owners,titles,result,directory,returnTo,configured,mode,range,query,download,workspace,fieldStored,protectedWrites} from './directory-presence-helpers.mjs';
  4  | const status=p=>p.getByRole('combobox',{name:'Directory notes status',exact:true});
  5  | async function controls(p,{q,notes,priority='All',due='All',word='Phrase',order='Original'}){
  6  |  await expect(p.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q);
  7  |  for(const [name,value] of [['Directory notes status',notes],['Priority filter',priority],['Directory due status',due],['Directory search mode',word],['Directory order',order]])await expect(p.getByRole('combobox',{name,exact:true}).locator('option:checked')).toHaveText(value);
  8  | }
  9  | async function ownNotes(p,owner,title,value){const o=await p.context().newPage();try{await returnTo(o,owner);await taskRow(o,title).getByRole('textbox',{name:'Task notes',exact:true}).fill(value);await taskRow(o,title).getByRole('button',{name:'Save notes',exact:true}).click();await fieldStored(o,owner,title,'Task notes',value);}finally{await o.close();}}
  10 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  11 | if(stage>=36){
  12 |  test('122 notes presence treats whitespace as present and intersects every directory filter',async({page})=>{
  13 |   test.setTimeout(120000);const a='Notes presence first',b='Notes presence second',c='Notes presence archived',q='NotesPresence'+stage,date=String(2900+stage)+'-03-01',onlyNote='OnlyNotesToken'+stage;
  14 |   const empty=q+' empty',white=q+' whitespace',present=q+' present',other=q+' other',archived=q+' archived',literal='  '+onlyNote+' Ω\n<script>literal</script>  ';
  15 |   await createProject(page,a);await openProject(page,a);await configured(page,a,empty,{priority:'High',date});await configured(page,a,white,{notes:' \t\n '});await configured(page,a,present,{priority:'High',date,completed:true,notes:literal});await createProject(page,b);await openProject(page,b);await configured(page,b,other,{priority:'Low',date});await createProject(page,c);await openProject(page,c);await configured(page,c,archived,{priority:'High',date,notes:literal});await page.goto('/');await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  16 |   await directory(page,q,empty);await result(page,[a,b],['1/3 completed','0/1 completed'],[empty,white,present,other],'1/4 completed');await expect(status(page).locator('option:checked')).toHaveText('All');await status(page).selectOption({label:'Empty'});await result(page,[a,b],['0/1 completed','0/1 completed'],[empty,other],'0/2 completed');await status(page).selectOption({label:'Present'});await result(page,[a],['1/2 completed'],[white,present],'1/2 completed');expect((await workspace(page))[0].tasks.map(t=>t.notes)).toEqual([' \t\n ',literal]);
  17 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a],['1/1 completed'],[present],'1/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a],['1/1 completed'],[present],'1/1 completed');await page.getByRole('combobox',{name:'Directory due status',exact:true}).selectOption({label:'Undated'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Directory due status',exact:true}).selectOption({label:'Dated'});await result(page,[a],['1/1 completed'],[present],'1/1 completed');await range(page,String(2900+stage)+'-03-02');await result(page,[],[],[],'0/0 completed');await range(page,date);await result(page,[a],['1/1 completed'],[present],'1/1 completed');
  18 |   await query(page,onlyNote);await result(page,[],[],[],'0/0 completed');await query(page,q);await result(page,[a],['1/1 completed'],[present],'1/1 completed');await status(page).selectOption({label:'Empty'});await result(page,[a],['0/1 completed'],[empty],'0/1 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'Present'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await protectedWrites(page);await controls(page,{q,notes:'Present',priority:'High',due:'Dated'});
  19 |  });
  20 |  test('123 notes presence alone selects each bulk write and assignment or clear changes membership',async({page})=>{
  21 |   test.setTimeout(180000);const a='Notes independent bulk',q='NotesIndependent'+stage,target=q+' empty',guard=q+' present',deleted=q+' protected deleted',date=String(2920+stage)+'-03-01',literal=' \t\n ',original='Guard original Ω\nkept';
  22 |   await createProject(page,a);await openProject(page,a);await configured(page,a,target,{priority:'High'});await configured(page,a,guard,{priority:'High',notes:original});await configured(page,a,deleted,{priority:'High',date,notes:'',deleted:true});await directory(page,q,target);await result(page,[a],['0/2 completed'],[target,guard],'0/2 completed');await status(page).selectOption({label:'Empty'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');
  23 |   await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();await result(page,[a],['1/1 completed'],[target],'1/1 completed');await expectPersistedCompletion(page,a,target,true);await expectPersistedCompletion(page,a,guard,false);
  24 |   const o=await page.context().newPage();try{await returnTo(o,a);await o.getByRole('checkbox',{name:'Complete '+guard,exact:true}).check();await expectPersistedCompletion(o,a,guard,true);}finally{await o.close();}
  25 |   await page.getByRole('button',{name:'Reopen visible tasks',exact:true}).click();await result(page,[a],['0/1 completed'],[target],'0/1 completed');await expectPersistedCompletion(page,a,target,false);await expectPersistedCompletion(page,a,guard,true);
  26 |   await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await expect(rows(page).getByTestId('directory-task-priority')).toHaveText(['Low']);await expectPersistedPriority(page,a,target,'Low');await expectPersistedPriority(page,a,guard,'High');
  27 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(date);await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await expect(rows(page).getByTestId('directory-task-due-date')).toHaveText([date]);await fieldStored(page,a,target,'Task due date',date);await fieldStored(page,a,guard,'Task due date','');
  28 |   await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(literal);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await result(page,[],[],[],'0/0 completed');await fieldStored(page,a,target,'Task notes',literal);await fieldStored(page,a,guard,'Task notes',original);await controls(page,{q,notes:'Empty'});
> 29 |   await ownNotes(page,a,guard,'');await directory(page,q,target);await result(page,[a],['1/2 completed'],[target,guard],'1/2 completed');await status(page).selectOption({label:'Present'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');expect((await workspace(page))[0].tasks.map(t=>t.title)).toEqual([target]);
     |                                                                                                                                                                                                                                                                                                                        ^ Error: expect(received).toEqual(expected) // deep equality
  30 |   await page.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');await protectedWrites(page);await page.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'All'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a],['1/2 completed'],[target,guard],'1/2 completed');await status(page).selectOption({label:'Present'});await result(page,[a],['0/1 completed'],[target],'0/1 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill('');await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await result(page,[],[],[],'0/0 completed');await fieldStored(page,a,target,'Task notes','');await status(page).selectOption({label:'Empty'});await result(page,[a],['1/2 completed'],[target,guard],'1/2 completed');await returnTo(page,a);expect((await download(page)).tasks).toEqual([{title:target,completed:false,priority:'Low',dueDate:date,notes:'',deleted:false},{title:guard,completed:true,priority:'High',dueDate:'',notes:'',deleted:false},{title:deleted,completed:false,priority:'High',dueDate:date,notes:'',deleted:true}]);
  31 |  });
  32 |  test('124 imported duplicate owners and literal notes keep independent identity and read-only exports',async({page})=>{
  33 |   test.setTimeout(120000);const a='Notes duplicate owner',q='NotesDuplicate'+stage,date=String(2940+stage)+'-03-01',literal='  Ω\n<script>literal</script>  ';
  34 |   const task=(suffix,notes,completed=false)=>({title:q+' '+suffix,completed,priority:'High',dueDate:date,notes,deleted:false});const first=[task('first empty',''),task('first whitespace',' \t\n ',true)],second=[task('second present',literal),task('second empty','',true)],third=[task('archived',literal)];const projects=[{name:projectName(a),archived:false,defaultPriority:'High',tasks:first},{name:projectName(a),archived:false,defaultPriority:'Low',tasks:second},{name:projectName(a),archived:true,defaultPriority:'Normal',tasks:third}];
  35 |   await page.goto('/');await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify({format:'workboard-workspace',version:1,projects}));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await expect(projectRow(page,a).first()).toBeVisible();await expect(projectRow(page,a)).toHaveCount(2);await directory(page,q,first[0].title);await result(page,[a,a],['1/2 completed','1/2 completed'],[...first,...second].map(t=>t.title),'2/4 completed');await status(page).selectOption({label:'Empty'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first[0].title,second[1].title],'1/2 completed');expect(await workspace(page)).toEqual(projects.slice(0,2).map((p,i)=>({...p,tasks:[i?second[1]:first[0]]})));
  36 |   await status(page).selectOption({label:'Present'});await result(page,[a,a],['1/1 completed','0/1 completed'],[first[1].title,second[0].title],'1/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['1/1 completed','0/1 completed'],[first[1].title,second[0].title],'1/2 completed');await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();expect(await download(page)).toEqual(projects[1]);
  37 |   await directory(page,q,first[0].title);await result(page,[a,a],['1/2 completed','1/2 completed'],[...first,...second].map(t=>t.title),'2/4 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[a],['0/1 completed'],[third[0].title],'0/1 completed');await status(page).selectOption({label:'Empty'});await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'Present'});await result(page,[a],['0/1 completed'],[third[0].title],'0/1 completed');expect(await workspace(page)).toEqual([projects[2]]);await protectedWrites(page);
  38 |  });
  39 |  test('125 notes membership writes preserve both owner positions and the restart fixture',async({page})=>{
  40 |   test.setTimeout(180000);const a='Notes restart first',b='Notes restart second',travel='NotesRestart'+stage+' travelling',before='Notes before '+stage,after='Notes after '+stage,hold='Notes hold '+stage,later='Notes later '+stage,date=String(2960+stage)+'-03-01',literal='  Notes restart Ω\nkept  ';
  41 |   await createProject(page,a);await openProject(page,a);await createTask(page,before);await configured(page,a,travel,{priority:'High',date,completed:true});await createTask(page,after);await createProject(page,b);await openProject(page,b);await createTask(page,hold);
  42 |   async function move(source,target,sourceOrder,targetOrder){await returnTo(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const o=await page.context().newPage();try{await returnTo(o,target);await titles(o,targetOrder);await returnTo(o,source);await titles(o,sourceOrder);}finally{await o.close();}}
  43 |   await move(a,b,[before,after],[hold,travel]);await returnTo(page,b);await createTask(page,later);await move(b,a,[hold,later],[before,travel,after]);await directory(page,travel,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await status(page).selectOption({label:'Present'});await result(page,[],[],[],'0/0 completed');await status(page).selectOption({label:'Empty'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');
  44 |   await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(literal);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await result(page,[],[],[],'0/0 completed');await controls(page,{q:travel,notes:'Empty'});await fieldStored(page,a,travel,'Task notes',literal);await status(page).selectOption({label:'Present'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill('');await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await result(page,[],[],[],'0/0 completed');await fieldStored(page,a,travel,'Task notes','');await status(page).selectOption({label:'Empty'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(literal);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await result(page,[],[],[],'0/0 completed');await fieldStored(page,a,travel,'Task notes',literal);await status(page).selectOption({label:'Present'});await result(page,[a],['1/1 completed'],[travel],'1/1 completed');
  45 |   await returnTo(page,a);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expectPersistedPriority(page,a,travel,'High');await expectPersistedCompletion(page,a,travel,true);await move(a,b,[before,after],[hold,travel,later]);await move(b,a,[hold,later],[before,travel,after]);await returnTo(page,a);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(literal);
  46 |  });
  47 | }
  48 | 
```