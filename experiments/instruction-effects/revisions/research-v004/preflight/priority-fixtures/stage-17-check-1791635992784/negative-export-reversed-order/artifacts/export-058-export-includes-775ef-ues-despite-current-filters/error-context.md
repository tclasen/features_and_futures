# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: export.spec.mjs >> 058 export includes every stored task in order with literal values despite current filters
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-017-draft/suite/export.spec.mjs:7:2

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Array [
-   "Export before",
-   "Export  deleted",
    "Export after",
+   "Export  deleted",
+   "Export before",
  ]
```

# Page snapshot

```yaml
- generic [ref=f18e1]:
  - heading "task-017 Export full Ω" [level=1] [ref=f18e2]
  - group [ref=f18e4]:
    - button "Download project" [active] [ref=f18e5]
  - group [ref=f18e7]:
    - button "Projects" [ref=f18e8]
  - group [ref=f18e10]:
    - generic [ref=f18e11]:
      - text: Task search
      - textbox "Task search" [ref=f18e12]: does not match
    - button "Search tasks" [ref=f18e13]
  - group [ref=f18e15]:
    - generic [ref=f18e16]:
      - text: Due from
      - textbox "Due from" [ref=f18e17]: 2038-01-01
    - generic [ref=f18e18]:
      - text: Due through
      - textbox "Due through" [ref=f18e19]: 2038-01-01
    - button "Apply due range" [ref=f18e20]
  - group [ref=f18e22]:
    - generic [ref=f18e23]:
      - text: New project name
      - textbox "New project name" [ref=f18e24]
    - button "Rename project" [ref=f18e25]
  - generic [ref=f18e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f18e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f18e30]:
    - generic [ref=f18e31]:
      - text: Task title
      - textbox "Task title" [ref=f18e32]
    - button "Create task" [ref=f18e33]
  - generic [ref=f18e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f18e36]:
      - option "All"
      - option "Open"
      - option "Completed"
      - option "Deleted" [selected]
  - generic [ref=f18e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f18e39]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority} from './helpers.mjs';
  3  | async function exported(page){const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download project',exact:true}).click()]);expect(download.suggestedFilename()).toBe('workboard-project.json');const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));expect(value.format).toBe('workboard-project');expect(value.version).toBe(1);return value.project;}
  4  | async function saved(page,owner,title,label,value){await taskRow(page,title).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}}
  5  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  6  | if(stage>=17){
  7  |  test('058 export includes every stored task in order with literal values despite current filters',async({page})=>{
  8  |   const owner='Export full Ω',title='Export  deleted';await createProject(page,'Export foreign');await openProject(page,'Export foreign');await createTask(page,'Must not export');await createProject(page,owner);await openProject(page,owner);for(const t of ['Export before',title,'Export after'])await createTask(page,t);await page.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,title,'High');await saved(page,owner,title,'Task due date','2038-01-01');const note='  Export Ω\n<script>literal</script>  ';await saved(page,owner,title,'Task notes',note);await taskRow(page,title).getByRole('button',{name:'Delete task',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');return projectRow(observer,owner).getByTestId('project-summary').textContent();},{timeout:5000}).toBe('0/2 completed');}finally{await observer.close();}
> 9  |   await filterDeleted(page);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2038-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2038-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await page.getByRole('textbox',{name:'Task search',exact:true}).fill('does not match');await page.getByRole('button',{name:'Search tasks',exact:true}).click();const data=await exported(page);expect(data).toMatchObject({name:projectName(owner),archived:false,defaultPriority:'Normal'});expect(data.tasks).toHaveLength(3);expect(data.tasks.map(t=>t.title)).toEqual(['Export before',title,'Export after']);expect(data.tasks[1]).toMatchObject({title,completed:true,priority:'High',dueDate:'2038-01-01',notes:note,deleted:true});for(const i of [0,2])expect(data.tasks[i]).toMatchObject({completed:false,priority:'Normal',dueDate:'',notes:'',deleted:false});await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Deleted');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2038-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2038-01-01');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('does not match');await page.reload();const again=await exported(page);expect(again).toEqual(data);
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                ^ Error: expect(received).toEqual(expected) // deep equality
  10 |  });
  11 |  test('059 archived upgraded and empty projects export without mutation',async({page})=>{
  12 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await page.getByTestId('project-row').filter({hasText:'task-016 Persistence renamed'}).filter({visible:true}).getByRole('button',{name:'Open project',exact:true}).click();await expect(page.getByRole('button',{name:'Download project',exact:true})).toBeEnabled();const data=await exported(page);expect(data).toMatchObject({name:'task-016 Persistence renamed',archived:true,defaultPriority:'Low'});expect(data.tasks).toHaveLength(1);expect(data.tasks[0]).toMatchObject({title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29',notes:'',deleted:false});await expect(taskRow(page,'Memory kept').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();await createProject(page,'Export empty');await openProject(page,'Export empty');const empty=await exported(page);expect(empty).toMatchObject({name:projectName('Export empty'),archived:false,defaultPriority:'Normal',tasks:[]});await page.reload();expect(await exported(page)).toEqual(empty);
  13 |  });
  14 | }
  15 | async function filterDeleted(page){await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});}
  16 | 
```