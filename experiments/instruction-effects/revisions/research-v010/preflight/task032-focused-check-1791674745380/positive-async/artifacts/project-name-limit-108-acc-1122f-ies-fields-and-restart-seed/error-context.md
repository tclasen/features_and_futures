# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: project-name-limit.spec.mjs >> 108 accepted boundary workspace names preserve duplicate identities fields and restart seed
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task032-executed-suite/project-name-limit.spec.mjs:28:2

# Error details

```
Error: expect(received).not.toBe(expected) // Object.is equality

Expected: not "http://127.0.0.1:56447/projects/1108"
```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - heading "task-032 Name limit persistence 😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀" [level=1] [ref=f5e2]
  - group [ref=f5e4]:
    - button "Download project" [ref=f5e5]
  - group [ref=f5e7]:
    - button "Projects" [ref=f5e8]
  - group [ref=f5e10]:
    - generic [ref=f5e11]:
      - text: Task search
      - textbox "Task search" [ref=f5e12]
    - button "Search tasks" [ref=f5e13]
  - group [ref=f5e15]:
    - generic [ref=f5e16]:
      - text: Due from
      - textbox "Due from" [ref=f5e17]
    - generic [ref=f5e18]:
      - text: Due through
      - textbox "Due through" [ref=f5e19]
    - button "Apply due range" [ref=f5e20]
  - group [ref=f5e22]:
    - generic [ref=f5e23]:
      - text: New project name
      - textbox "New project name" [ref=f5e24]
    - button "Rename project" [ref=f5e25]
  - generic [ref=f5e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f5e28]:
      - option "Low" [selected]
      - option "Normal"
      - option "High"
  - group [ref=f5e30]:
    - generic [ref=f5e31]:
      - text: Task title
      - textbox "Task title" [ref=f5e32]
    - button "Create task" [ref=f5e33]
  - generic [ref=f5e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f5e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f5e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f5e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f5e40]:
    - text: Name limit imported record
    - group [ref=f5e42]:
      - button "Delete task" [ref=f5e43]
    - checkbox "Complete Name limit imported record" [ref=f5e45]
    - group [ref=f5e47]:
      - generic [ref=f5e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f5e49]: Name limit Ω kept
      - button "Save notes" [ref=f5e50]
    - group [ref=f5e52]:
      - generic [ref=f5e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f5e54]: 2080-02-29
      - button "Save due date" [ref=f5e55]
    - group [ref=f5e57]:
      - generic [ref=f5e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f5e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-032 Name limit boundary guard"
          - option "task-032 Name limit boundary 😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀"
          - option "task-032 Name limit later valid"
          - option "task-032 Name limit renamed 🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂"
          - option "task-032 Name limit rename guard"
          - option "task-032 Name limit import guard"
      - button "Move task" [ref=f5e60]
    - group [ref=f5e62]:
      - generic [ref=f5e63]:
        - text: New task title
        - textbox "New task title" [ref=f5e64]
      - button "Rename task" [ref=f5e65]
    - generic [ref=f5e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
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
  26 |   for(const c of cases){await page.goto('/');const raw=JSON.stringify(c.doc);await page.getByRole('textbox',{name:c.label,exact:true}).fill(raw);if(c.name!==undefined)await page.getByRole('textbox',{name:'Imported project name',exact:true}).fill(c.name);await page.getByRole('button',{name:c.button,exact:true}).click();await expect(page.getByRole('alert')).toContainText(c.error);await expect(page.getByRole('textbox',{name:c.label,exact:true})).toHaveValue(raw);if(c.name!==undefined)await expect(page.getByRole('textbox',{name:'Imported project name',exact:true})).toHaveValue(c.name);const observer=await page.context().newPage();try{await observer.goto('/');await expect(rows(observer)).toHaveCount(count);await openProject(observer,'Name limit import guard');await expect(taskRow(observer,'Guard stays')).toBeVisible();}finally{await observer.close();}}
  27 |  });
  28 |  test('108 accepted boundary workspace names preserve duplicate identities fields and restart seed',async({page})=>{
> 29 |   test.setTimeout(60000);const name=boundary('Name limit persistence','😀');expect(Array.from(name).length).toBe(200);const a=owner('  '+name+'  '),b={...owner(name),archived:true};await page.goto('/');await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify({format:'workboard-workspace',version:1,projects:[a,b]}));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await page.reload();await literalRow(page,name).getByRole('button',{name:'Open project',exact:true}).click();const activeUrl=page.url();const exported=await download(page);expect(exported.project).toEqual({...a,name});await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(literalRow(page,name)).toHaveCount(1);await literalRow(page,name).getByRole('button',{name:'Open project',exact:true}).click();expect(page.url()).not.toBe(activeUrl);expect((await download(page)).project).toEqual(b);if(stage===32){await page.goto('/');await createProject(page,'Legacy title owner');await openProject(page,'Legacy title owner');await createTask(page,'🙂'.repeat(501));await taskRow(page,'🙂'.repeat(501)).getByRole('textbox',{name:'Task notes',exact:true}).fill('  Legacy title Ω\nkept  ');await taskRow(page,'🙂'.repeat(501)).getByRole('button',{name:'Save notes',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Legacy title owner');return taskRow(observer,'🙂'.repeat(501)).getByRole('textbox',{name:'Task notes',exact:true}).inputValue();}).toBe('  Legacy title Ω\nkept  ');}finally{await observer.close();}}
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               ^ Error: expect(received).not.toBe(expected) // Object.is equality
  30 |  });
  31 | }
  32 | 
```