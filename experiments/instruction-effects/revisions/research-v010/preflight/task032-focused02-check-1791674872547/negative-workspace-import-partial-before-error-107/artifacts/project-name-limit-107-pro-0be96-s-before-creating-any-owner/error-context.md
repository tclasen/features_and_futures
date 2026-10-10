# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: project-name-limit.spec.mjs >> 107 project and workspace import reject oversized names before creating any owner
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task032-executed02-suite/project-name-limit.spec.mjs:23:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').visible()
Expected: 8
Received: 9
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').visible() with timeout 5000ms
  - waiting for getByTestId('project-row').visible()
    14 × locator resolved to 9 elements
       - unexpected value "9"

```

# Page snapshot

```yaml
- generic [active] [ref=f10e1]:
  - heading "Workboard" [level=1] [ref=f10e2]
  - group [ref=f10e4]:
    - button "Task directory" [ref=f10e5]
  - group [ref=f10e7]:
    - generic [ref=f10e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f10e9]
    - generic [ref=f10e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f10e11]
    - button "Import project" [ref=f10e12]
  - group [ref=f10e14]:
    - generic [ref=f10e15]:
      - text: Workspace JSON
      - textbox "Workspace JSON" [ref=f10e16]: "{\"format\":\"workboard-workspace\",\"version\":1,\"projects\":[{\"name\":\"task-032 Name limit would create\",\"archived\":false,\"defaultPriority\":\"Low\",\"tasks\":[{\"title\":\"Name limit imported record\",\"completed\":false,\"priority\":\"High\",\"dueDate\":\"2080-02-29\",\"notes\":\" Name limit Ω\\nkept \",\"deleted\":false}]},{\"name\":\"😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀\",\"archived\":false,\"defaultPriority\":\"Low\",\"tasks\":[{\"title\":\"Name limit imported record\",\"completed\":false,\"priority\":\"High\",\"dueDate\":\"2080-02-29\",\"notes\":\" Name limit Ω\\nkept \",\"deleted\":false}]}]}"
    - button "Import workspace" [ref=f10e17]
  - alert [ref=f10e18]: Invalid workspace JSON
  - group [ref=f10e20]:
    - generic [ref=f10e21]:
      - text: Project name
      - textbox "Project name" [ref=f10e22]
    - button "Create project" [ref=f10e23]
  - group [ref=f10e25]:
    - generic [ref=f10e26]:
      - text: Project search
      - textbox "Project search" [ref=f10e27]
    - button "Search projects" [ref=f10e28]
  - generic [ref=f10e30]:
    - text: Project filter
    - combobox "Project filter" [ref=f10e31]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f10e32]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f10e34]:
      - button "Open project" [ref=f10e35]
    - group [ref=f10e37]:
      - button "Archive project" [ref=f10e38]
  - generic [ref=f10e39]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f10e41]:
      - button "Open project" [ref=f10e42]
    - group [ref=f10e44]:
      - button "Archive project" [ref=f10e45]
  - generic [ref=f10e46]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f10e48]:
      - button "Open project" [ref=f10e49]
    - group [ref=f10e51]:
      - button "Archive project" [ref=f10e52]
  - generic [ref=f10e53]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f10e55]:
      - button "Open project" [ref=f10e56]
    - group [ref=f10e58]:
      - button "Archive project" [ref=f10e59]
  - generic [ref=f10e60]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f10e62]:
      - button "Open project" [ref=f10e63]
    - group [ref=f10e65]:
      - button "Archive project" [ref=f10e66]
  - generic [ref=f10e67]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f10e69]:
      - button "Open project" [ref=f10e70]
    - group [ref=f10e72]:
      - button "Archive project" [ref=f10e73]
  - generic [ref=f10e74]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f10e76]:
      - button "Open project" [ref=f10e77]
    - group [ref=f10e79]:
      - button "Archive project" [ref=f10e80]
  - generic [ref=f10e81]:
    - text: task-032 Name limit import guard0/1 completed
    - group [ref=f10e83]:
      - button "Open project" [ref=f10e84]
    - group [ref=f10e86]:
      - button "Archive project" [ref=f10e87]
  - generic [ref=f10e88]:
    - text: task-032 Name limit would create0/1 completed
    - group [ref=f10e90]:
      - button "Open project" [ref=f10e91]
    - group [ref=f10e93]:
      - button "Archive project" [ref=f10e94]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser} from './helpers.mjs';
  3  | const alert='Project name must be at most 200 characters';
  4  | function boundary(label,emoji){const prefix=projectName(label)+' ';return prefix+emoji.repeat(200-Array.from(prefix).length);}
  5  | const rows=page=>page.getByTestId('project-row').filter({visible:true});
  6  | const literalRow=(page,name)=>rows(page).filter({has:page.getByRole('button',{name:'Open project',exact:true})}).filter({hasText:new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))});
  7  | async function download(page){const [d]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download project',exact:true}).click()]);const stream=await d.createReadStream();const chunks=[];for await(const c of stream)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  8  | async function createLiteral(page,name){await page.goto('/');await page.getByRole('textbox',{name:'Project name',exact:true}).fill(name);await page.getByRole('button',{name:'Create project',exact:true}).click();await expect(literalRow(page,name.trim())).toBeVisible();}
  9  | const task=title=>({title,completed:false,priority:'High',dueDate:'2080-02-29',notes:'  Name limit Ω\nkept  ',deleted:false});
  10 | const owner=(name,tasks=[task('Name limit imported record')])=>({name,archived:false,defaultPriority:'Low',tasks});
  11 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  12 | if(stage>=32){
  13 |  test('105 project names count code points after trim and preserve rejected create input',async({page})=>{
  14 |   test.setTimeout(60000);await createProject(page,'Name limit boundary guard');const name=boundary('Name limit boundary','😀');await createLiteral(page,'  '+name+'  ');await page.reload();await literalRow(page,name).getByRole('button',{name:'Open project',exact:true}).click();expect((await download(page)).project.name).toBe(name);await page.goto('/');await expect(projectRow(page,'Name limit boundary guard')).toBeVisible();const count=await rows(page).count();
  15 |   for(const value of ['😀'.repeat(201),'e\u0301'.repeat(101)]){await page.getByRole('textbox',{name:'Project name',exact:true}).fill(value);await page.getByRole('button',{name:'Create project',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:alert}).first()).toContainText(alert);await expect(page.getByRole('textbox',{name:'Project name',exact:true})).toHaveValue(value);const observer=await page.context().newPage();try{await observer.goto('/');await expect(rows(observer)).toHaveCount(count);await expect(projectRow(observer,'Name limit boundary guard')).toBeVisible();}finally{await observer.close();}}
  16 |   const edited=projectName('Name limit later valid');await page.getByRole('textbox',{name:'Project name',exact:true}).fill(edited);await page.getByRole('button',{name:'Create project',exact:true}).click();await expect(projectRow(page,'Name limit later valid')).toBeVisible();await expect(rows(page)).toHaveCount(count+1);
  17 |  });
  18 |  test('106 rejected rename is atomic and successful boundary rename retains identity fields and owner order',async({page})=>{
  19 |   test.setTimeout(60000);const original='Name limit rename owner',guard='Name limit rename guard';await createProject(page,original);await openProject(page,original);const url=page.url();await createTask(page,'Name limit retained task');const before=await download(page);await createProject(page,guard);await openProject(page,original);
  20 |   const rejected='🙂'.repeat(201);await page.getByRole('textbox',{name:'New project name',exact:true}).fill(rejected);await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:alert}).first()).toContainText(alert);await expect(page.getByRole('textbox',{name:'New project name',exact:true})).toHaveValue(rejected);expect((await download(page)).project).toEqual(before.project);const identityObserver=await page.context().newPage();try{await identityObserver.goto('/');await openProject(identityObserver,original);expect(identityObserver.url()).toBe(url);}finally{await identityObserver.close();}
  21 |   const name=boundary('Name limit renamed','🙂');await page.getByRole('textbox',{name:'New project name',exact:true}).fill('  '+name+'  ');await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('heading',{name,exact:true}).first()).toBeVisible();const after=await download(page);expect(after.project).toEqual({...before.project,name});await page.goto('/');await expect(literalRow(page,name)).toBeVisible();await expect(projectRow(page,guard)).toBeVisible();const order=await rows(page).allTextContents();expect(order.findIndex(v=>v.includes(name))).toBeLessThan(order.findIndex(v=>v.includes(projectName(guard))));await page.reload();await literalRow(page,name).getByRole('button',{name:'Open project',exact:true}).click();expect(page.url()).toBe(url);await expect(taskRow(page,'Name limit retained task')).toBeVisible();
  22 |  });
  23 |  test('107 project and workspace import reject oversized names before creating any owner',async({page})=>{
  24 |   test.setTimeout(90000);await createProject(page,'Name limit import guard');await openProject(page,'Name limit import guard');await createTask(page,'Guard stays');await page.goto('/');await expect(projectRow(page,'Name limit import guard')).toBeVisible();const count=await rows(page).count();
  25 |   const cases=[{label:'Project JSON',button:'Import project',error:'Invalid project JSON',doc:{format:'workboard-project',version:1,project:owner('😀'.repeat(201))},name:projectName('Name limit invalid original')},{label:'Project JSON',button:'Import project',error:'Invalid project JSON',doc:{format:'workboard-project',version:1,project:owner(projectName('Name limit valid original'))},name:'🙂'.repeat(201)},{label:'Workspace JSON',button:'Import workspace',error:'Invalid workspace JSON',doc:{format:'workboard-workspace',version:1,projects:[owner(projectName('Name limit would create')),owner('😀'.repeat(201))]}}];
> 26 |   for(const c of cases){await page.goto('/');const raw=JSON.stringify(c.doc);await page.getByRole('textbox',{name:c.label,exact:true}).fill(raw);if(c.name!==undefined)await page.getByRole('textbox',{name:'Imported project name',exact:true}).fill(c.name);await page.getByRole('button',{name:c.button,exact:true}).click();await expect(page.getByRole('alert')).toContainText(c.error);await expect(page.getByRole('textbox',{name:c.label,exact:true})).toHaveValue(raw);if(c.name!==undefined)await expect(page.getByRole('textbox',{name:'Imported project name',exact:true})).toHaveValue(c.name);const observer=await page.context().newPage();try{await observer.goto('/');await expect(rows(observer)).toHaveCount(count);await openProject(observer,'Name limit import guard');await expect(taskRow(observer,'Guard stays')).toBeVisible();}finally{await observer.close();}}
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     ^ Error: expect(locator).toHaveCount(expected) failed
  27 |  });
  28 |  test('108 accepted boundary workspace names preserve duplicate identities fields and restart seed',async({page})=>{
  29 |   test.setTimeout(60000);const name=boundary('Name limit persistence','😀');expect(Array.from(name).length).toBe(200);const a=owner('  '+name+'  '),b={...owner(name),archived:true};await page.goto('/');await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify({format:'workboard-workspace',version:1,projects:[a,b]}));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await page.reload();await literalRow(page,name).getByRole('button',{name:'Open project',exact:true}).click();const exported=await download(page);const activeUrl=page.url();expect(exported.project).toEqual({...a,name});await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(literalRow(page,name)).toHaveCount(1);await expect(literalRow(page,name).getByRole('button',{name:'Restore project',exact:true})).toBeVisible();await literalRow(page,name).getByRole('button',{name:'Open project',exact:true}).click();expect((await download(page)).project).toEqual(b);expect(page.url()).not.toBe(activeUrl);if(stage===32){await page.goto('/');await createProject(page,'Legacy title owner');await openProject(page,'Legacy title owner');await createTask(page,'🙂'.repeat(501));await taskRow(page,'🙂'.repeat(501)).getByRole('textbox',{name:'Task notes',exact:true}).fill('  Legacy title Ω\nkept  ');await taskRow(page,'🙂'.repeat(501)).getByRole('button',{name:'Save notes',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Legacy title owner');return taskRow(observer,'🙂'.repeat(501)).getByRole('textbox',{name:'Task notes',exact:true}).inputValue();}).toBe('  Legacy title Ω\nkept  ');}finally{await observer.close();}}
  30 |  });
  31 | }
  32 | 
```