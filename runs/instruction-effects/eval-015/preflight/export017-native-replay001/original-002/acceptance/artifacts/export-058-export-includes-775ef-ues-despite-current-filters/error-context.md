# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: export.spec.mjs >> 058 export includes every stored task in order with literal values despite current filters
- Location: runs/instruction-effects/eval-015/preflight/export017-native-replay001/original/definitions/project/acceptance/export.spec.mjs:7:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: page.waitForEvent: Test timeout of 20000ms exceeded.
=========================== logs ===========================
waiting for event "download"
============================================================
```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - button "Projects" [ref=f1e3] [cursor=pointer]
  - heading "diagexport017-original-002 Export full Ω" [level=1] [ref=f1e4]
  - link "Download project" [ref=f1e5] [cursor=pointer]:
    - /url: /api/projects/641/export
  - generic [ref=f1e6]:
    - generic [ref=f1e7]:
      - generic [ref=f1e8]: New project name
      - textbox "New project name" [ref=f1e9]
    - button "Rename project" [ref=f1e10] [cursor=pointer]
  - generic [ref=f1e11]:
    - generic [ref=f1e12]: Default task priority
    - combobox "Default task priority" [ref=f1e13]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - generic [ref=f1e14]:
    - generic [ref=f1e15]:
      - generic [ref=f1e16]: Task title
      - textbox "Task title" [ref=f1e17]
    - button "Create task" [ref=f1e18] [cursor=pointer]
  - generic [ref=f1e19]:
    - generic [ref=f1e20]: Task filter
    - combobox "Task filter" [ref=f1e21]:
      - option "All"
      - option "Open"
      - option "Completed"
      - option "Deleted" [selected]
  - generic [ref=f1e22]:
    - generic [ref=f1e23]: Priority filter
    - combobox "Priority filter" [ref=f1e24]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f1e25]:
    - generic [ref=f1e26]: Due from
    - textbox "Due from" [ref=f1e27]: 2038-01-01
    - generic [ref=f1e28]: Due through
    - textbox "Due through" [ref=f1e29]: 2038-01-01
    - button "Apply due range" [ref=f1e30] [cursor=pointer]
  - generic [ref=f1e31]:
    - generic [ref=f1e32]:
      - generic [ref=f1e33]: Task search
      - textbox "Task search" [ref=f1e34]: does not match
    - button "Search tasks" [active] [ref=f1e35] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority} from './helpers.mjs';
> 3  | async function exported(page){const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download project',exact:true}).click()]);expect(download.suggestedFilename()).toBe('workboard-project.json');const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));expect(value.format).toBe('workboard-project');expect(value.version).toBe(1);return value.project;}
     |                                                                        ^ Error: page.waitForEvent: Test timeout of 20000ms exceeded.
  4  | async function saved(page,owner,title,label,value){await taskRow(page,title).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}}
  5  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  6  | if(stage>=17){
  7  |  test('058 export includes every stored task in order with literal values despite current filters',async({page})=>{
  8  |   const owner='Export full Ω',title='Export  deleted';await createProject(page,'Export foreign');await openProject(page,'Export foreign');await createTask(page,'Must not export');await createProject(page,owner);await openProject(page,owner);for(const t of ['Export before',title,'Export after'])await createTask(page,t);await page.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,title,'High');await saved(page,owner,title,'Task due date','2038-01-01');const note='  Export Ω\n<script>literal</script>  ';await saved(page,owner,title,'Task notes',note);await taskRow(page,title).getByRole('button',{name:'Delete task',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');return projectRow(observer,owner).getByTestId('project-summary').textContent();},{timeout:5000}).toBe('0/2 completed');}finally{await observer.close();}
  9  |   await filterDeleted(page);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2038-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2038-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await page.getByRole('textbox',{name:'Task search',exact:true}).fill('does not match');await page.getByRole('button',{name:'Search tasks',exact:true}).click();const data=await exported(page);expect(data).toMatchObject({name:projectName(owner),archived:false,defaultPriority:'Normal'});expect(data.tasks).toHaveLength(3);expect(data.tasks.map(t=>t.title)).toEqual(['Export before',title,'Export after']);expect(data.tasks[1]).toMatchObject({title,completed:true,priority:'High',dueDate:'2038-01-01',notes:note,deleted:true});for(const i of [0,2])expect(data.tasks[i]).toMatchObject({completed:false,priority:'Normal',dueDate:'',notes:'',deleted:false});await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Deleted');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2038-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2038-01-01');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('does not match');await page.reload();const again=await exported(page);expect(again).toEqual(data);
  10 |  });
  11 |  test('059 archived upgraded and empty projects export without mutation',async({page})=>{
  12 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await page.getByTestId('project-row').filter({hasText:'task-016 Persistence renamed'}).filter({visible:true}).getByRole('button',{name:'Open project',exact:true}).click();await expect(page.getByRole('button',{name:'Download project',exact:true})).toBeEnabled();const data=await exported(page);expect(data).toMatchObject({name:'task-016 Persistence renamed',archived:true,defaultPriority:'Low'});expect(data.tasks).toHaveLength(1);expect(data.tasks[0]).toMatchObject({title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29',notes:'',deleted:false});await expect(taskRow(page,'Memory kept').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();await createProject(page,'Export empty');await openProject(page,'Export empty');const empty=await exported(page);expect(empty).toMatchObject({name:projectName('Export empty'),archived:false,defaultPriority:'Normal',tasks:[]});await page.reload();expect(await exported(page)).toEqual(empty);
  13 |  });
  14 | }
  15 | async function filterDeleted(page){await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});}
  16 | 
```