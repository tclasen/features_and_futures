# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: task-title-limit.spec.mjs >> 111 both imports reject an oversized final title atomically and retain original JSON
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task033-executed02-suite/task-title-limit.spec.mjs:23:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').visible()
Expected: 9
Received: 10
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').visible() with timeout 5000ms
  - waiting for getByTestId('project-row').visible()
    14 × locator resolved to 10 elements
       - unexpected value "10"

```

# Page snapshot

```yaml
- generic [active] [ref=f8e1]:
  - heading "Workboard" [level=1] [ref=f8e2]
  - group [ref=f8e4]:
    - button "Task directory" [ref=f8e5]
  - group [ref=f8e7]:
    - generic [ref=f8e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f8e9]
    - generic [ref=f8e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f8e11]
    - button "Import project" [ref=f8e12]
  - group [ref=f8e14]:
    - generic [ref=f8e15]:
      - text: Workspace JSON
      - textbox "Workspace JSON" [ref=f8e16]: "{\"format\":\"workboard-workspace\",\"version\":1,\"projects\":[{\"name\":\"task-033 Title would create\",\"archived\":false,\"defaultPriority\":\"Low\",\"tasks\":[{\"title\":\"Good title\",\"completed\":false,\"priority\":\"High\",\"dueDate\":\"2400-02-29\",\"notes\":\" Title import Ω\\nkept \",\"deleted\":false}]},{\"name\":\"task-033 Title final owner\",\"archived\":false,\"defaultPriority\":\"Low\",\"tasks\":[{\"title\":\"Title import would create\",\"completed\":false,\"priority\":\"High\",\"dueDate\":\"2400-02-29\",\"notes\":\" Title import Ω\\nkept \",\"deleted\":false},{\"title\":\"🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂\",\"completed\":false,\"priority\":\"High\",\"dueDate\":\"2400-02-29\",\"notes\":\" Title import Ω\\nkept \",\"deleted\":false}]}]}"
    - button "Import workspace" [ref=f8e17]
  - alert [ref=f8e18]: Invalid workspace JSON
  - group [ref=f8e20]:
    - generic [ref=f8e21]:
      - text: Project name
      - textbox "Project name" [ref=f8e22]
    - button "Create project" [ref=f8e23]
  - group [ref=f8e25]:
    - generic [ref=f8e26]:
      - text: Project search
      - textbox "Project search" [ref=f8e27]
    - button "Search projects" [ref=f8e28]
  - generic [ref=f8e30]:
    - text: Project filter
    - combobox "Project filter" [ref=f8e31]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f8e32]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f8e34]:
      - button "Open project" [ref=f8e35]
    - group [ref=f8e37]:
      - button "Archive project" [ref=f8e38]
  - generic [ref=f8e39]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f8e41]:
      - button "Open project" [ref=f8e42]
    - group [ref=f8e44]:
      - button "Archive project" [ref=f8e45]
  - generic [ref=f8e46]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f8e48]:
      - button "Open project" [ref=f8e49]
    - group [ref=f8e51]:
      - button "Archive project" [ref=f8e52]
  - generic [ref=f8e53]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f8e55]:
      - button "Open project" [ref=f8e56]
    - group [ref=f8e58]:
      - button "Archive project" [ref=f8e59]
  - generic [ref=f8e60]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f8e62]:
      - button "Open project" [ref=f8e63]
    - group [ref=f8e65]:
      - button "Archive project" [ref=f8e66]
  - generic [ref=f8e67]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f8e69]:
      - button "Open project" [ref=f8e70]
    - group [ref=f8e72]:
      - button "Archive project" [ref=f8e73]
  - generic [ref=f8e74]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f8e76]:
      - button "Open project" [ref=f8e77]
    - group [ref=f8e79]:
      - button "Archive project" [ref=f8e80]
  - generic [ref=f8e81]:
    - text: task-032 Legacy title owner0/1 completed
    - group [ref=f8e83]:
      - button "Open project" [ref=f8e84]
    - group [ref=f8e86]:
      - button "Archive project" [ref=f8e87]
  - generic [ref=f8e88]:
    - text: task-033 Title import guard0/1 completed
    - group [ref=f8e90]:
      - button "Open project" [ref=f8e91]
    - group [ref=f8e93]:
      - button "Archive project" [ref=f8e94]
  - generic [ref=f8e95]:
    - text: task-033 Title would create0/1 completed
    - group [ref=f8e97]:
      - button "Open project" [ref=f8e98]
    - group [ref=f8e100]:
      - button "Archive project" [ref=f8e101]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const alert='Task title must be at most 500 characters';
  4  | async function home(page,owner){await page.goto('/');await openProject(page,owner);}
  5  | async function exported(page){const [d]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download project',exact:true}).click()]);const s=await d.createReadStream();const chunks=[];for await(const c of s)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8')).project;}
  6  | async function saved(page,owner,title,label,value){await taskRow(page,title).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await home(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:label,exact:true}).inputValue();}).toBe(value);}finally{await observer.close();}await home(page,owner);}
  7  | async function titles(page,expected){const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(expected.length);for(const [i,name] of expected.entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+name,exact:true})).toBeVisible();}
  8  | const record=title=>({title,completed:false,priority:'High',dueDate:'2400-02-29',notes:'  Title import Ω\nkept  ',deleted:false});
  9  | const owner=name=>({name,archived:false,defaultPriority:'Low',tasks:[record('Title import would create'),record('🙂'.repeat(501))]});
  10 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  11 | if(stage>=33){
  12 |  test('109 task title creation counts trimmed Unicode code points and retains oversized input',async({page})=>{
  13 |   test.setTimeout(60000);const a='Title limit boundary',value='😀'.repeat(500);await createProject(page,a);await openProject(page,a);await createTask(page,'Boundary guard');await createTask(page,'  '+value+'  ');const before=await exported(page);expect(before.tasks.map(t=>t.title)).toEqual(['Boundary guard',value]);
  14 |   for(const rejected of ['😀'.repeat(501),'e\u0301'.repeat(251)]){await page.getByRole('textbox',{name:'Task title',exact:true}).fill(rejected);await page.getByRole('button',{name:'Create task',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:alert}).first()).toContainText(alert);await expect(page.getByRole('textbox',{name:'Task title',exact:true})).toHaveValue(rejected);const observer=await page.context().newPage();try{await home(observer,a);expect(await exported(observer)).toEqual(before);}finally{await observer.close();}}
  15 |   await createTask(page,'Later  literal Ω title');await page.reload();expect((await exported(page)).tasks.map(t=>t.title)).toEqual(['Boundary guard',value,'Later  literal Ω title']);
  16 |  });
  17 |  test('110 rejected and successful title renames preserve metadata query and every reserved owner position',async({page})=>{
  18 |   test.setTimeout(90000);const a='Title limit first',b='Title limit second',old='Title limit travelling',fresh='🙂'.repeat(500);await createProject(page,a);await openProject(page,a);for(const t of ['Title before',old,'Title after'])await createTask(page,t);await taskRow(page,old).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,a,old,'High');await home(page,a);await page.getByRole('checkbox',{name:'Complete '+old,exact:true}).check();await expectPersistedCompletion(page,a,old,true);await home(page,a);await saved(page,a,old,'Task due date','2072-02-29');await saved(page,a,old,'Task notes','  Title literal Ω\nretained  ');await createProject(page,b);await openProject(page,b);await createTask(page,'Other before');
  19 |   async function move(source,target,title,left,right){await home(page,source);await taskRow(page,title).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,title).getByRole('button',{name:'Move task',exact:true}).click();const observer=await page.context().newPage();try{await home(observer,target);await titles(observer,right);await home(observer,source);await titles(observer,left);}finally{await observer.close();}await home(page,target);}
  20 |   await move(a,b,old,['Title before','Title after'],['Other before',old]);await move(b,a,old,['Other before'],['Title before',old,'Title after']);await home(page,b);await createTask(page,'Other later');await home(page,a);const before=await exported(page);await page.getByRole('textbox',{name:'Task search',exact:true}).fill(old);await page.getByRole('button',{name:'Search tasks',exact:true}).click();await titles(page,[old]);const rejected='🙂'.repeat(501);await taskRow(page,old).getByRole('textbox',{name:'New task title',exact:true}).fill(rejected);await taskRow(page,old).getByRole('button',{name:'Rename task',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:alert}).first()).toContainText(alert);await expect(taskRow(page,old).getByRole('textbox',{name:'New task title',exact:true})).toHaveValue(rejected);expect(await exported(page)).toEqual(before);await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue(old);
  21 |   await taskRow(page,old).getByRole('textbox',{name:'New task title',exact:true}).fill('  '+fresh+'  ');await taskRow(page,old).getByRole('button',{name:'Rename task',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue(old);await home(page,a);expect((await exported(page)).tasks).toEqual(before.tasks.map(t=>t.title===old?{...t,title:fresh}:t));await move(a,b,fresh,['Title before','Title after'],['Other before',fresh,'Other later']);await move(b,a,fresh,['Other before','Other later'],['Title before',fresh,'Title after']);await page.reload();await titles(page,['Title before',fresh,'Title after']);await expect(taskRow(page,fresh).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('  Title literal Ω\nretained  ');
  22 |  });
  23 |  test('111 both imports reject an oversized final title atomically and retain original JSON',async({page})=>{
  24 |   test.setTimeout(90000);const a='Title import guard';await createProject(page,a);await openProject(page,a);await createTask(page,'Guard retained');const before=await exported(page);await page.goto('/');await expect(projectRow(page,a)).toBeVisible();const count=await page.getByTestId('project-row').filter({visible:true}).count();const cases=[{label:'Project JSON',button:'Import project',alert:'Invalid project JSON',doc:{format:'workboard-project',version:1,project:owner(projectName('Title invalid owner'))},name:projectName('Title invalid copy')},{label:'Workspace JSON',button:'Import workspace',alert:'Invalid workspace JSON',doc:{format:'workboard-workspace',version:1,projects:[{...owner(projectName('Title would create')),tasks:[record('Good title')]},owner(projectName('Title final owner'))]}}];
> 25 |   for(const c of cases){await page.goto('/');const raw=JSON.stringify(c.doc);await page.getByRole('textbox',{name:c.label,exact:true}).fill(raw);if(c.name)await page.getByRole('textbox',{name:'Imported project name',exact:true}).fill(c.name);await page.getByRole('button',{name:c.button,exact:true}).click();await expect(page.getByRole('alert')).toContainText(c.alert);await expect(page.getByRole('textbox',{name:c.label,exact:true})).toHaveValue(raw);const observer=await page.context().newPage();try{await observer.goto('/');await expect(observer.getByTestId('project-row').filter({visible:true})).toHaveCount(count);await openProject(observer,a);expect(await exported(observer)).toEqual(before);}finally{await observer.close();}}
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         ^ Error: expect(locator).toHaveCount(expected) failed
  26 |  });
  27 |  test('112 seed title boundary persistence without altering pre-limit longer records',async({page})=>{
  28 |   test.setTimeout(60000);const a='Title limit persistence',value='😀'.repeat(500);await createProject(page,a);await openProject(page,a);await createTask(page,value);await saved(page,a,value,'Task notes','  Title boundary Ω\nkept  ');await page.reload();expect((await exported(page)).tasks.map(t=>t.title)).toEqual([value]);await page.goto('/');await expect(projectRow(page,a).getByTestId('project-summary')).toHaveText('0/1 completed');
  29 |   const prior=page.getByTestId('project-row').filter({visible:true}).filter({hasText:'task-032 Legacy title owner'});await expect(prior).toHaveCount(1);await prior.getByRole('button',{name:'Open project',exact:true}).click();await expect(taskRow(page,'🙂'.repeat(501))).toBeVisible();await expect(taskRow(page,'🙂'.repeat(501)).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('  Legacy title Ω\nkept  ');
  30 |  });
  31 | }
  32 | 
```