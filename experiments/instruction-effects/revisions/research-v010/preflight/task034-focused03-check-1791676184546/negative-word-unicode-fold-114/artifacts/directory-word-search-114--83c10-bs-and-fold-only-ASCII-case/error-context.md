# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-word-search.spec.mjs >> 114 word query tokens split only ASCII spaces and tabs and fold only ASCII case
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task034-executed03-suite/directory-word-search.spec.mjs:50:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  - 0
+ Received  + 1

  Array [
    "Ä34 Bee34",
+   "ä34 Bee34",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:57623/directory?directory_order=Original&project_scope=Active&filter=All&priority_filter=All&due_from=2434-02-28&due_through=2434-02-28&directory_search=%C3%8434+bee34&directory_mode…"
    3 × locator resolved to 0 elements
    11 × locator resolved to 2 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f35e1]:
  - heading "Task directory" [level=1] [ref=f35e2]
  - text: 0/2 completed
  - generic [ref=f35e3]:
    - text: task-034 Word Unicode owner0/2 completed
    - group [ref=f35e5]:
      - button "Open project" [ref=f35e6]
  - group [ref=f35e8]:
    - button "Complete visible tasks" [ref=f35e9]
  - group [ref=f35e11]:
    - button "Reopen visible tasks" [disabled] [ref=f35e12]
  - group [ref=f35e14]:
    - button "Delete visible tasks" [ref=f35e15]
  - group [ref=f35e17]:
    - button "Restore visible tasks" [disabled] [ref=f35e18]
  - group [ref=f35e20]:
    - generic [ref=f35e21]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f35e22]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f35e23]
  - group [ref=f35e25]:
    - generic [ref=f35e26]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f35e27]
    - button "Save visible due date" [ref=f35e28]
  - group [ref=f35e30]:
    - generic [ref=f35e31]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f35e32]
    - button "Save visible notes" [ref=f35e33]
  - group [ref=f35e35]:
    - button "Export matching workspace" [ref=f35e36]
  - group [ref=f35e38]:
    - button "Projects" [ref=f35e39]
  - generic [ref=f35e41]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f35e42]:
      - option "Phrase"
      - option "All words" [selected]
      - option "Any words"
  - generic [ref=f35e44]:
    - text: Directory order
    - combobox "Directory order" [ref=f35e45]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f35e47]:
    - text: Project scope
    - combobox "Project scope" [ref=f35e48]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f35e50]:
    - text: Task filter
    - combobox "Task filter" [ref=f35e51]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f35e53]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f35e54]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f35e56]:
    - generic [ref=f35e57]:
      - text: Directory search
      - textbox "Directory search" [ref=f35e58]: Ä34 bee34
    - button "Search directory" [ref=f35e59]
  - group [ref=f35e61]:
    - generic [ref=f35e62]:
      - text: Due from
      - textbox "Due from" [ref=f35e63]: 2434-02-28
    - generic [ref=f35e64]:
      - text: Due through
      - textbox "Due through" [ref=f35e65]: 2434-02-28
    - button "Apply due range" [ref=f35e66]
  - generic [ref=f35e67]:
    - text: Ä34 Bee34task-034 Word Unicode ownerOpenNormal2434-02-28
    - group [ref=f35e69]:
      - button "Open project" [ref=f35e70]
  - generic [ref=f35e71]:
    - text: ä34 Bee34task-034 Word Unicode ownerOpenNormal2434-02-28
    - group [ref=f35e73]:
      - button "Open project" [ref=f35e74]
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
> 10 |  await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
     |                                                            ^ Error: expect(locator).toHaveText(expected) failed
  11 |  await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));
  12 |  await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);
  13 |  await expect(p.getByTestId('directory-summary')).toHaveText(total);
  14 | }
  15 | async function directory(p,q,ready){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await expect(rows(p).getByTestId('directory-task-title').filter({hasText:ready}).first()).toBeVisible();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
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
  33 | async function query(p,value){await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(value);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
  34 | async function download(p){const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download project',exact:true}).click()]);const s=await d.createReadStream(),chunks=[];for await(const c of s)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8')).project;}
  35 | async function workspace(p){const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Export matching workspace',exact:true}).click()]);const s=await d.createReadStream(),chunks=[];for await(const c of s)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8')).projects;}
  36 | async function fieldStored(p,owner,title,label,value){const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:label,exact:true}).inputValue();}).toBe(value);}finally{await o.close();}}
  37 | async function protectedWrites(p){for(const label of ['Complete visible tasks','Reopen visible tasks','Delete visible tasks','Set visible priority','Save visible due date','Save visible notes'])await expect(p.getByRole('button',{name:label,exact:true})).toBeDisabled();}
  38 | 
  39 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  40 | if(stage>=34){
  41 |  test('113 directory Phrase All words and Any words reuse the current title query with ASCII normalization and empty query',async({page})=>{
  42 |   test.setTimeout(120000);const a='Word modes owner',x='Beryl'+stage,y='Cobalt'+stage,date=String(2300+stage)+'-02-28';const titles=[x+'   '+y,x+' gap '+y,x+' solitary',y+' solitary','Neither'+stage,'pre'+x+'post'];
  43 |   await createProject(page,a);await openProject(page,a);for(const title of titles)await configured(page,a,title,{date,notes:title===titles[4]?x+' '+y:''});
  44 |   await directory(page,x+' '+y,titles[0]);await expect(mode(page).locator('option')).toHaveText(['Phrase','All words','Any words']);await expect(mode(page).locator('option:checked')).toHaveText('Phrase');await result(page,[a],['0/1 completed'],[titles[0]],'0/1 completed');
  45 |   await range(page,String(2300+stage)+'-03-01');await result(page,[],[],[],'0/0 completed');await range(page,date);await result(page,[a],['0/1 completed'],[titles[0]],'0/1 completed');await query(page,'Absent'+stage);await result(page,[],[],[],'0/0 completed');await query(page,'  '+x.toLowerCase()+'\t '+y.toUpperCase()+'  ');await result(page,[a],['0/1 completed'],[titles[0]],'0/1 completed');
  46 |   await mode(page).selectOption({label:'All words'});await result(page,[a],['0/2 completed'],titles.slice(0,2),'0/2 completed');const normalize=q=>q.trim().replace(/[ \t]+/g,' ').replace(/[A-Z]/g,c=>c.toLowerCase());expect(normalize(await page.getByRole('textbox',{name:'Directory search',exact:true}).inputValue())).toBe(normalize(x+' '+y));
  47 |   await mode(page).selectOption({label:'Any words'});await result(page,[a],['0/5 completed'],[...titles.slice(0,4),titles[5]],'0/5 completed');await query(page,' \t ');await result(page,[a],['0/6 completed'],titles,'0/6 completed');await query(page,x+' '+x);await result(page,[a],['0/4 completed'],[titles[0],titles[1],titles[2],titles[5]],'0/4 completed');await query(page,x+' '+y);await result(page,[a],['0/5 completed'],[...titles.slice(0,4),titles[5]],'0/5 completed');
  48 |   await mode(page).selectOption({label:'All words'});await result(page,[a],['0/2 completed'],titles.slice(0,2),'0/2 completed');await query(page,' \t ');await result(page,[a],['0/6 completed'],titles,'0/6 completed');await query(page,x+' '+x);await result(page,[a],['0/4 completed'],[titles[0],titles[1],titles[2],titles[5]],'0/4 completed');await mode(page).selectOption({label:'Phrase'});await result(page,[],[],[],'0/0 completed');await query(page,' \t ');await result(page,[a],['0/6 completed'],titles,'0/6 completed');
  49 |  });
  50 |  test('114 word query tokens split only ASCII spaces and tabs and fold only ASCII case',async({page})=>{
  51 |   test.setTimeout(120000);const a='Word Unicode owner',x='Ash'+stage,y='Bee'+stage,date=String(2400+stage)+'-02-28';const titles=[x+'\u00a0'+y+' NBSP',x+' '+y+' ASCII','Ä'+stage+' '+y,'ä'+stage+' '+y,x+'\t'+y+' TAB'];
  52 |   await createProject(page,a);await openProject(page,a);for(const title of titles)await configured(page,a,title,{date});await directory(page,x+'\u00a0'+y,titles[0]);await result(page,[a],['0/1 completed'],[titles[0]],'0/1 completed');await range(page,String(2400+stage)+'-03-01');await result(page,[],[],[],'0/0 completed');await range(page,date);
  53 |   await result(page,[a],['0/1 completed'],[titles[0]],'0/1 completed');await query(page,x.toLowerCase()+' '+y.toUpperCase());await result(page,[a],['0/2 completed'],[titles[1],titles[4]],'0/2 completed');await mode(page).selectOption({label:'All words'});await result(page,[a],['0/3 completed'],[titles[0],titles[1],titles[4]],'0/3 completed');await query(page,x+'\u00a0'+y);await result(page,[a],['0/1 completed'],[titles[0]],'0/1 completed');await query(page,x+' '+y);await result(page,[a],['0/3 completed'],[titles[0],titles[1],titles[4]],'0/3 completed');await mode(page).selectOption({label:'Any words'});await result(page,[a],['0/5 completed'],titles,'0/5 completed');await query(page,x+'\u00a0'+y);await result(page,[a],['0/1 completed'],[titles[0]],'0/1 completed');await query(page,'Ä'+stage+' '+y.toLowerCase());await result(page,[a],['0/5 completed'],titles,'0/5 completed');await mode(page).selectOption({label:'All words'});await result(page,[a],['0/1 completed'],[titles[2]],'0/1 completed');await query(page,'ä'+stage+' '+y);await result(page,[a],['0/1 completed'],[titles[3]],'0/1 completed');await query(page,x.toLowerCase()+' '+y.toUpperCase());await result(page,[a],['0/3 completed'],[titles[0],titles[1],titles[4]],'0/3 completed');await mode(page).selectOption({label:'Phrase'});await result(page,[a],['0/2 completed'],[titles[1],titles[4]],'0/2 completed');await returnTo(page,a);expect((await download(page)).tasks.map(t=>t.title)).toEqual(titles);
  54 |  });
  55 |  test('115 word matching intersects filters orders owners exports and every current bulk operation with protected scopes',async({page})=>{
  56 |   test.setTimeout(240000);const a='Word scope Z first',b='Word scope A second',c='Word scope archived',x='Topaz'+stage,y='Quartz'+stage,q=x.toLowerCase()+' '+y.toLowerCase(),date=String(2500+stage)+'-02-28',note='  Word scope Ω\nkept  ';const first=x+' gap '+y+' zulu',second=y+' gap '+x+' alpha',single=x+' only',deleted=x+' '+y+' deleted',archived=x+' '+y+' archived';
  57 |   await createProject(page,a);await openProject(page,a);await configured(page,a,first,{priority:'High',date,notes:note});await configured(page,a,single,{priority:'High',date,notes:'Guard literal'});await configured(page,a,deleted,{priority:'High',date,notes:note,deleted:true});await createProject(page,b);await openProject(page,b);await configured(page,b,second,{priority:'High',date,notes:note,completed:true});await createProject(page,c);await openProject(page,c);await configured(page,c,archived,{priority:'High',date,notes:note});await page.goto('/');await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  58 |   await directory(page,q,first);await result(page,[],[],[],'0/0 completed');await mode(page).selectOption({label:'All words'});await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await range(page,String(2500+stage)+'-03-01');await result(page,[],[],[],'0/0 completed');await range(page,date);await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');
  59 |   const doc=await workspace(page);expect(doc.map(p=>p.name)).toEqual([projectName(a),projectName(b)]);expect(doc.map(p=>p.tasks.map(t=>t.title))).toEqual([[first],[second]]);
  60 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a],['0/1 completed'],[first],'0/1 completed');await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await expectPersistedCompletion(page,a,first,true);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[a,b],['1/1 completed','1/1 completed'],[second,first],'2/2 completed');await page.getByRole('button',{name:'Reopen visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await expectPersistedCompletion(page,a,first,false);await expectPersistedCompletion(page,b,second,false);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  61 |   await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await result(page,[],[],[],'0/0 completed');await expectPersistedPriority(page,a,first,'Low');await expectPersistedPriority(page,b,second,'Low');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  62 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill('');await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await result(page,[],[],[],'0/0 completed');await fieldStored(page,a,first,'Task due date','');await fieldStored(page,b,second,'Task due date','');await range(page,'');await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  63 |   const changed='  Word edit Ω\nretained  ';await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(changed);await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows(page).getByTestId('directory-task-notes')).toHaveText([changed,changed]);await fieldStored(page,a,first,'Task notes',changed);await fieldStored(page,b,second,'Task notes',changed);await page.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await protectedWrites(page);await expect(page.getByRole('button',{name:'Restore visible tasks',exact:true})).toBeEnabled();expect((await workspace(page)).flatMap(p=>p.tasks).map(t=>t.deleted)).toEqual([true,true]);await page.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  64 |   await expect(mode(page).locator('option:checked')).toHaveText('All words');await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q);await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText('Title');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await protectedWrites(page);await expect(page.getByRole('button',{name:'Restore visible tasks',exact:true})).toBeDisabled();
  65 |   const o=await page.context().newPage();try{await returnTo(o,a);await expect(taskRow(o,single).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Guard literal');await expect(taskRow(o,single).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expect(taskRow(o,single).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(o.getByRole('checkbox',{name:'Complete '+single,exact:true})).not.toBeChecked();await o.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(o,deleted).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(note);}finally{await o.close();}
  66 |  });
  67 |  test('116 word modes and matching export are read-only and retain both remembered owner positions and restart seed',async({page})=>{
  68 |   test.setTimeout(180000);const a='Word restart first',b='Word restart second',x='AmberRestart'+stage,y='CobaltRestart'+stage,q=x.toLowerCase()+' '+y.toLowerCase(),travel=x+' gap '+y,before=x+' guard',after='Word after '+stage,hold='Word hold '+stage,later='Word later '+stage;
  69 |   await createProject(page,a);await openProject(page,a);await configured(page,a,before,{date:String(2600+stage)+'-02-28'});await configured(page,a,travel,{priority:'High',date:String(2600+stage)+'-02-28',notes:'  Word mode Ω\nkept  ',completed:true});await createTask(page,after);await createProject(page,b);await openProject(page,b);await createTask(page,hold);
  70 |   async function move(source,target,sourceOrder,targetOrder){await returnTo(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const o=await page.context().newPage();try{await returnTo(o,target);await titles(o,targetOrder);await returnTo(o,source);await titles(o,sourceOrder);}finally{await o.close();}await returnTo(page,target);}
  71 |   await move(a,b,[before,after],[hold,travel]);await createTask(page,later);await move(b,a,[hold,later],[before,travel,after]);const original=await download(page);await directory(page,travel,travel);await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await range(page,String(2600+stage)+'-03-01');await result(page,[],[],[],'0/0 completed');await range(page,String(2600+stage)+'-02-28');await result(page,[a],['1/1 completed'],[travel],'1/1 completed');await query(page,q);await result(page,[],[],[],'0/0 completed');for(const value of ['All words','Any words']){await mode(page).selectOption({label:value});const selected=value==='All words'?[travel]:[before,travel];await result(page,[a],[value==='All words'?'1/1 completed':'1/2 completed'],selected,value==='All words'?'1/1 completed':'1/2 completed');const snapshot=await workspace(page);expect(snapshot[0].tasks.map(t=>t.title)).toEqual(selected);expect(snapshot[0].tasks.find(t=>t.title===travel)).toMatchObject({title:travel,priority:'High',dueDate:String(2600+stage)+'-02-28',notes:'  Word mode Ω\nkept  ',completed:true,deleted:false});}
  72 |   await mode(page).selectOption({label:'Phrase'});await result(page,[],[],[],'0/0 completed');await query(page,'');await result(page,[a],['1/2 completed'],[before,travel],'1/2 completed');await returnTo(page,a);expect(await download(page)).toEqual(original);await move(a,b,[before,after],[hold,travel,later]);await move(b,a,[hold,later],[before,travel,after]);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('  Word mode Ω\nkept  ');await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(String(2600+stage)+'-02-28');
  73 |  });
  74 | }
  75 | 
```