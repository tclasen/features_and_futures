# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: import.spec.mjs >> 062 invalid later tasks reject the entire import without partial project task or existing-data writes
- Location: experiments/instruction-effects/revisions/research-v006/decisions/task-020-draft/suite/import.spec.mjs:20:2

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('alert')
Expected substring: "Invalid project JSON"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" getByRole('alert') with timeout 5000ms
  - waiting for getByRole('alert')

```

```yaml
- heading "task-020 Task guard rejected 12" [level=1]
- group:
  - button "Download project"
- group:
  - button "Projects"
- group:
  - text: Task search
  - textbox "Task search"
  - button "Search tasks"
- group:
  - text: Due from
  - textbox "Due from"
  - text: Due through
  - textbox "Due through"
  - button "Apply due range"
- group:
  - text: New project name
  - textbox "New project name"
  - button "Rename project"
- text: Default task priority
- combobox "Default task priority":
  - option "Low"
  - option "Normal" [selected]
  - option "High"
- group:
  - text: Task title
  - textbox "Task title"
  - button "Create task"
- text: Task filter
- combobox "Task filter":
  - option "All" [selected]
  - option "Open"
  - option "Completed"
  - option "Deleted"
- text: Priority filter
- combobox "Priority filter":
  - option "All" [selected]
  - option "Low"
  - option "Normal"
  - option "High"
- text: Valid first
- group:
  - button "Delete task"
- checkbox "Complete Valid first"
- group:
  - text: Task notes
  - textbox "Task notes"
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date"
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Position first owner" [selected]
    - option "task-012 Position second owner"
    - option "task-018 Import restart"
    - option "task-012 Search Mixed first"
    - option "task-012 Search mixed last"
    - option "task-012 Search double gap"
    - option "task-012 Whitespace Saved first"
    - option "task-020 Task guard existing"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal" [selected]
  - option "High"
- text: Portable task
- group:
  - button "Delete task"
- checkbox "Complete Portable task"
- group:
  - text: Task notes
  - textbox "Task notes"
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date"
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Position first owner" [selected]
    - option "task-012 Position second owner"
    - option "task-018 Import restart"
    - option "task-012 Search Mixed first"
    - option "task-012 Search mixed last"
    - option "task-012 Search double gap"
    - option "task-012 Whitespace Saved first"
    - option "task-020 Task guard existing"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal" [selected]
  - option "High"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const task=(title='Portable task')=>({title,completed:false,priority:'Normal',dueDate:'',notes:'',deleted:false});
  4  | const document=(tasks=[task()])=>({format:'workboard-project',version:1,project:{name:'Portable original',archived:false,defaultPriority:'Normal',tasks}});
  5  | const copy=value=>JSON.parse(JSON.stringify(value));
  6  | async function exported(page){const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download project',exact:true}).click()]);const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  7  | async function imported(page,data,name){await page.goto('/');await page.getByRole('textbox',{name:'Project JSON',exact:true}).fill(JSON.stringify(data));await page.getByRole('textbox',{name:'Imported project name',exact:true}).fill('  '+projectName(name)+'  ');await page.getByRole('button',{name:'Import project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName(name),exact:true}).first()).toBeVisible();}
  8  | async function saved(page,owner,title,label,value){await taskRow(page,title).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}}
  9  | async function guards(page,prefix){await createProject(page,prefix+' existing');await openProject(page,prefix+' existing');await createTask(page,'Guard retained');await createProject(page,prefix+' archived');await projectRow(page,prefix+' archived').getByRole('button',{name:'Archive project',exact:true}).click();const observer=await page.context().newPage();const counts={};try{await observer.goto('/');await expect(projectRow(observer,prefix+' existing')).toBeVisible();counts.Active=await observer.getByTestId('project-row').filter({visible:true}).count();await observer.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(observer,prefix+' archived')).toBeVisible();counts.Archived=await observer.getByTestId('project-row').filter({visible:true}).count();}finally{await observer.close();}return counts;}
  10 | async function unchanged(page,prefix,counts){const observer=await page.context().newPage();try{await observer.goto('/');await expect(projectRow(observer,prefix+' existing')).toBeVisible();await expect(observer.getByTestId('project-row').filter({visible:true})).toHaveCount(counts.Active);await expect(projectRow(observer,prefix+' existing').getByTestId('project-summary')).toHaveText('0/1 completed');await observer.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(observer,prefix+' archived')).toBeVisible();await expect(observer.getByTestId('project-row').filter({visible:true})).toHaveCount(counts.Archived);}finally{await observer.close();}}
> 11 | async function rejected(page,raw,name,alert='Invalid project JSON'){await page.goto('/');await page.getByRole('textbox',{name:'Project JSON',exact:true}).fill(raw);await page.getByRole('textbox',{name:'Imported project name',exact:true}).fill(name);await page.getByRole('button',{name:'Import project',exact:true}).click();await expect(page.getByRole('alert')).toContainText(alert);await expect(page.getByRole('textbox',{name:'Project JSON',exact:true})).toHaveValue(raw);await expect(page.getByRole('textbox',{name:'Imported project name',exact:true})).toHaveValue(name);}
     |                                                                                                                                                                                                                                                                                                                                                                          ^ Error: expect(locator).toContainText(expected) failed
  12 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  13 | if(stage>=18){
  14 |  test('060 exported projects import independently with saved fields deleted order and project defaults',async({page})=>{
  15 |   const owner='Import origin',title='Imported reserved',note='  Import Ω\n<script>literal</script>  ';await createProject(page,owner);await openProject(page,owner);for(const t of ['Imported before',title,'Imported after'])await createTask(page,t);await page.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await expectPersistedCompletion(page,owner,title,true);await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,title,'High');await saved(page,owner,title,'Task due date','2040-02-29');await saved(page,owner,title,'Task notes',note);await taskRow(page,title).getByRole('button',{name:'Delete task',exact:true}).click();await page.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:'Low'});const observer=await page.context().newPage();let original;try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);original=await exported(observer);return original.project.defaultPriority;},{timeout:5000}).toBe('Low');}finally{await observer.close();}const data=copy(original);data.project.id=-999;data.project.tasks[0].id=-999;await imported(page,data,'Import copy');await expect(page.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('Low');await expect(taskRow(page,'Imported before')).toBeVisible();await expect(taskRow(page,'Imported after')).toBeVisible();await createTask(page,'Imported arrival');await expect(taskRow(page,'Imported arrival').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Low');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,title)).toBeVisible();await expect(page.getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeChecked();await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(note);await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();await expect(taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2040-02-29');await expect(taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await taskRow(page,title).getByRole('button',{name:'Restore task',exact:true}).click();await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(4);for(const [i,t] of ['Imported before',title,'Imported after','Imported arrival'].entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+t,exact:true})).toBeVisible();await saved(page,'Import copy',title,'Task notes','Changed only copy');await page.goto('/');await openProject(page,owner);expect(await exported(page)).toEqual(original);
  16 |  });
  17 |  test('061 malformed root documents and blank override reject atomically and retain inputs',async({page})=>{
  18 |   test.setTimeout(40000);const prefix='Parse guard',counts=await guards(page,prefix);const good=document([]);const variants=['{broken',JSON.stringify(null),JSON.stringify([]),JSON.stringify({}),JSON.stringify({...good,format:'other'}),JSON.stringify({...good,version:2}),JSON.stringify({...good,version:true}),JSON.stringify({...good,project:{...good.project,name:'   '}}),JSON.stringify({...good,project:{...good.project,archived:'false'}}),JSON.stringify({...good,project:{...good.project,defaultPriority:'Urgent'}}),JSON.stringify({...good,project:{...good.project,tasks:{}}})];for(const [i,raw] of variants.entries()){await rejected(page,raw,projectName(prefix+' rejected '+i));await unchanged(page,prefix,counts);}await rejected(page,JSON.stringify(good),'  ','Project name is required');await unchanged(page,prefix,counts);
  19 |  });
  20 |  test('062 invalid later tasks reject the entire import without partial project task or existing-data writes',async({page})=>{
  21 |   test.setTimeout(40000);const prefix='Task guard',counts=await guards(page,prefix);const variants=[null,'task',{}, {...task(),title:'   '},{...task(),title:7},{...task(),completed:1},{...task(),priority:'Urgent'},{...task(),dueDate:'2041-02-29'},{...task(),dueDate:'2040-13-01'},{...task(),dueDate:null},{...task(),notes:7},{...task(),deleted:'false'}];for(const key of ['completed','priority','dueDate','notes','deleted']){const missing=task();delete missing[key];variants.push(missing);}for(const [i,bad] of variants.entries()){await rejected(page,JSON.stringify(document([task('Valid first'),bad])),projectName(prefix+' rejected '+i));await unchanged(page,prefix,counts);}
  22 |  });
  23 |  test('063 archived and empty imports preserve flags literal data and native restart sentinels',async({page})=>{
  24 |   const doc=document([{title:'Imported live',completed:false,priority:'Low',dueDate:'2044-02-29',notes:'Live import',deleted:false},{title:'Imported deleted',completed:true,priority:'High',dueDate:'2042-01-01',notes:'Import Ω\nretained',deleted:true}]);doc.project.id=-999;doc.project.tasks[0].id=-999;doc.project.archived=true;doc.project.defaultPriority='High';await imported(page,doc,'Import restart');await expect(page.getByText('Archived project',{exact:true})).toBeVisible();await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Live import');await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,'Imported deleted')).toBeVisible();await expect(taskRow(page,'Imported deleted').getByRole('button',{name:'Restore task',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Import restart').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Import restart');await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task notes',exact:true})).toBeEnabled();await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,'Imported deleted').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Import Ω\nretained');await expect(taskRow(page,'Imported deleted').getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();const emptyDoc=document([]);emptyDoc.project.id=-999;await imported(page,emptyDoc,'Import empty');expect((await exported(page)).project).toMatchObject({name:projectName('Import empty'),archived:false,defaultPriority:'Normal',tasks:[]});await page.reload();expect((await exported(page)).project.tasks).toEqual([]);
  25 |  });
  26 | }
  27 | 
```