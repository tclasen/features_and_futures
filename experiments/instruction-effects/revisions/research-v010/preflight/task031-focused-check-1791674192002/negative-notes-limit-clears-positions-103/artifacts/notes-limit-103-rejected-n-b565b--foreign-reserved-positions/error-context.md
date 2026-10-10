# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notes-limit.spec.mjs >> 103 rejected notes and later valid edits preserve own and foreign reserved positions
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task031-executed-suite/notes-limit.spec.mjs:30:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete Limit travelling', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete Limit travelling', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete Limit travelling', exact: true })

```

```yaml
- heading "task-031 Notes limit position second" [level=1]
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
- text: Limit before B
- group:
  - button "Delete task"
- checkbox "Complete Limit before B"
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
    - option "task-031 Notes limit position first"
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
- text: Limit after B
- group:
  - button "Delete task"
- checkbox "Complete Limit after B"
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
    - option "task-031 Notes limit position first"
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
- text: Limit travelling
- group:
  - button "Delete task"
- checkbox "Complete Limit travelling"
- group:
  - text: Task notes
  - textbox "Task notes": Original notes
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
    - option "task-031 Notes limit position first"
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
  3  | const alertText='Task notes must be at most 10000 characters';
  4  | async function home(page,owner){await page.goto('/');await openProject(page,owner);}
  5  | async function stored(page,owner,title,value){const observer=await page.context().newPage();try{await expect.poll(async()=>{await home(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:'Task notes',exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}}
  6  | async function save(page,title,value){await taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:'Save notes',exact:true}).click();}
  7  | async function field(page,owner,title,label,value){await taskRow(page,title).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:'Save due date',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await home(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:label,exact:true}).inputValue();}).toBe(value);}finally{await observer.close();}await home(page,owner);}
> 8  | async function titles(page,expected){const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(expected.length);for(const [i,title] of expected.entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
     |                                                                                                                                                                                                                                                                                   ^ Error: expect(locator).toBeVisible() failed
  9  | async function rejected(page,owner,title,value,original){await save(page,title,value);await expect(page.getByRole('alert').filter({hasText:alertText}).first()).toContainText(alertText);await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(value);await stored(page,owner,title,original);await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(value);}
  10 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  11 | if(stage>=31){
  12 |  test('101 individual notes count Unicode code points and retain rejected input before a valid clear',async({page})=>{
  13 |   test.setTimeout(60000);const owner='Notes limit boundary',title='Boundary record',limit='😀'.repeat(10000);await createProject(page,owner);await openProject(page,owner);await createTask(page,title);
  14 |   await save(page,title,limit);await stored(page,owner,title,limit);await home(page,owner);await rejected(page,owner,title,'😀'.repeat(10001),limit);await rejected(page,owner,title,'e\u0301'.repeat(5001),limit);
  15 |   await save(page,title,'');await stored(page,owner,title,'');await home(page,owner);await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('');await expect(page.getByRole('alert')).toHaveCount(0);
  16 |  });
  17 |  test('102 oversized notes preserve other fields and another task while literal whitespace and LF remain intact',async({page})=>{
  18 |   test.setTimeout(90000);const owner='Notes limit atomic',title='Atomic record',other='Atomic guard',original='  Stored Ω\nkept literal  ';await createProject(page,owner);await openProject(page,owner);await createTask(page,title);await createTask(page,other);
  19 |   await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,title,'High');await home(page,owner);await field(page,owner,title,'Task due date','2068-02-29');await page.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await expectPersistedCompletion(page,owner,title,true);await home(page,owner);await save(page,title,original);await stored(page,owner,title,original);await home(page,owner);
  20 |   await page.getByRole('checkbox',{name:'Complete '+other,exact:true}).check();await expectPersistedCompletion(page,owner,other,true);await home(page,owner);
  21 |   const undated='Atomic high undated',dated='Other dated guard',open='Atomic open guard';
  22 |   for(const name of [undated,dated,open]){await createTask(page,name);await taskRow(page,name).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,name,'High');await home(page,owner);if(name!==undated)await field(page,owner,name,'Task due date','2068-02-29');if(name!==open){await page.getByRole('checkbox',{name:'Complete '+name,exact:true}).check();await expectPersistedCompletion(page,owner,name,true);await home(page,owner);}}
  23 |   const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(5);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await expect(rows).toHaveCount(4);await expect(taskRow(page,open)).toHaveCount(0);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(rows).toHaveCount(3);await expect(taskRow(page,other)).toHaveCount(0);
  24 |   await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2068-02-29');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2068-02-29');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,title)).toBeVisible();await expect(taskRow(page,dated)).toBeVisible();await expect(taskRow(page,undated)).toHaveCount(0);await expect(rows).toHaveCount(2);
  25 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('atomic');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,title)).toBeVisible();await expect(taskRow(page,dated)).toHaveCount(0);await expect(rows).toHaveCount(1);
  26 |   await rejected(page,owner,title,'x'.repeat(10001),original);await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Completed');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2068-02-29');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2068-02-29');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('atomic');await expect(rows).toHaveCount(1);
  27 |   await home(page,owner);await titles(page,[title,other,undated,dated,open]);await expect(taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2068-02-29');await expect(page.getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeChecked();await expect(taskRow(page,other).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('');
  28 |   const literal='  Ω 😀\nline two\n  ';await save(page,title,literal);await stored(page,owner,title,literal);await home(page,owner);await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(literal);
  29 |  });
  30 |  test('103 rejected notes and later valid edits preserve own and foreign reserved positions',async({page})=>{
  31 |   test.setTimeout(90000);const a='Notes limit position first',b='Notes limit position second',beforeA='Limit before A',afterA='Limit after A',beforeB='Limit before B',afterB='Limit after B',travel='Limit travelling';
  32 |   await createProject(page,a);await openProject(page,a);await createTask(page,beforeA);await createTask(page,travel);await createTask(page,afterA);await save(page,travel,'Original notes');await stored(page,a,travel,'Original notes');await home(page,a);
  33 |   await createProject(page,b);await openProject(page,b);await createTask(page,beforeB);
  34 |   async function move(source,target,sourceOrder,targetOrder){await home(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const observer=await page.context().newPage();try{await home(observer,target);await titles(observer,targetOrder);await home(observer,source);await titles(observer,sourceOrder);}finally{await observer.close();}await home(page,target);}
  35 |   await move(a,b,[beforeA,afterA],[beforeB,travel]);await move(b,a,[beforeB],[beforeA,travel,afterA]);await home(page,b);await createTask(page,afterB);await home(page,a);await rejected(page,a,travel,'😀'.repeat(10001),'Original notes');
  36 |   await move(a,b,[beforeA,afterA],[beforeB,travel,afterB]);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Original notes');await save(page,travel,'Later literal Ω\nkept');await stored(page,b,travel,'Later literal Ω\nkept');await move(b,a,[beforeB,afterB],[beforeA,travel,afterA]);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Later literal Ω\nkept');
  37 |  });
  38 |  test('104 seed individual notes boundary for process-restart checks',async({page})=>{
  39 |   test.setTimeout(60000);const owner='Notes limit persistence',title='Boundary kept',value='🙂'.repeat(10000);await createProject(page,owner);await openProject(page,owner);await createTask(page,title);await save(page,title,value);await stored(page,owner,title,value);await home(page,owner);await rejected(page,owner,title,'🙂'.repeat(10001),value);await home(page,owner);await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(value);await page.goto('/');await expect(projectRow(page,owner).getByTestId('project-summary')).toHaveText('0/1 completed');if(stage===31){const prefix=projectName('Legacy project name')+' ';const name='Legacy project name '+'😀'.repeat(201-Array.from(prefix).length);await createProject(page,name);await openProject(page,name);await createTask(page,'Legacy name record');await save(page,'Legacy name record','  Legacy name Ω\nkept  ');await stored(page,name,'Legacy name record','  Legacy name Ω\nkept  ');}
  40 |  });
  41 | }
  42 | 
```