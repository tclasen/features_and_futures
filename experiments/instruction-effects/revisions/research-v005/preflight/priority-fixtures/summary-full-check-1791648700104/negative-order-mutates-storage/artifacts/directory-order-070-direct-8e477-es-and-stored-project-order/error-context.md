# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-order.spec.mjs >> 070 directory ordering is global stable and preserves literal titles and stored project order
- Location: experiments/instruction-effects/revisions/research-v005/decisions/task-022-draft/suite/directory-order.spec.mjs:10:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('task-row').visible().first().getByRole('checkbox', { name: 'Complete task-022 Order stable zulu', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('task-row').visible().first().getByRole('checkbox', { name: 'Complete task-022 Order stable zulu', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').visible().first().getByRole('checkbox', { name: 'Complete task-022 Order stable zulu', exact: true })

```

```yaml
- heading "task-022 Ordering Zulu owner" [level=1]
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
- text: task-022 Order stable Alpha
- group:
  - button "Delete task"
- checkbox "Complete task-022 Order stable Alpha"
- group:
  - text: Task notes
  - textbox "Task notes"
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2053-01-01
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
    - option "task-022 Ordering Alpha owner"
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
- text: task-022 Order stable bravo
- group:
  - button "Delete task"
- checkbox "Complete task-022 Order stable bravo"
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
    - option "task-022 Ordering Alpha owner"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low" [selected]
  - option "Normal"
  - option "High"
- text: task-022 Order stable zulu
- group:
  - button "Delete task"
- checkbox "Complete task-022 Order stable zulu"
- group:
  - text: Task notes
  - textbox "Task notes"
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2053-02-01
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
    - option "task-022 Ordering Alpha owner"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal"
  - option "High" [selected]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
  4  | const order=p=>p.getByRole('combobox',{name:'Directory order',exact:true});
  5  | const title=p=>rows(p).getByTestId('directory-task-title');
  6  | async function directory(p,q){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await expect(order(p).locator('option:checked')).toHaveText('Original');await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
  7  | async function configured(p,owner,name,priority,date=''){await createTask(p,name);if(priority!=='Normal'){await taskRow(p,name).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:priority});await expectPersistedPriority(p,owner,name,priority);}if(date){await taskRow(p,name).getByRole('textbox',{name:'Task due date',exact:true}).fill(date);await taskRow(p,name).getByRole('button',{name:'Save due date',exact:true}).click();const observer=await p.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);return taskRow(observer,name).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe(date);}finally{await observer.close();}}}
  8  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  9  | if(stage>=21){
  10 |  test('070 directory ordering is global stable and preserves literal titles and stored project order',async({page})=>{
  11 |   const a='Ordering Zulu owner',b='Ordering Alpha owner',prefix=projectName('Order stable'),z=prefix+' zulu',bravo=prefix+' bravo',upper=prefix+' Alpha',lower=prefix+' ALPHA';
  12 |   await createProject(page,a);await openProject(page,a);await configured(page,a,z,'High','2053-02-01');await configured(page,a,bravo,'Low');await configured(page,a,upper,'Normal','2053-01-01');await createProject(page,b);await openProject(page,b);await configured(page,b,lower,'Normal','2053-01-01');await configured(page,b,bravo,'High','2053-02-01');
  13 |   await directory(page,prefix);await expect(order(page).locator('option')).toHaveText(['Original','Priority','Due date','Title']);await expect(title(page)).toHaveText([z,bravo,upper,lower,bravo]);
  14 |   await order(page).selectOption({label:'Priority'});await expect(title(page)).toHaveText([z,bravo,upper,lower,bravo]);await expect(rows(page).getByTestId('directory-project-name')).toHaveText([projectName(a),projectName(b),projectName(a),projectName(b),projectName(a)]);
  15 |   await order(page).selectOption({label:'Due date'});await expect(title(page)).toHaveText([upper,lower,z,bravo,bravo]);await expect(rows(page).getByTestId('directory-project-name')).toHaveText([projectName(a),projectName(b),projectName(a),projectName(b),projectName(a)]);
  16 |   await order(page).selectOption({label:'Title'});await expect(title(page)).toHaveText([upper,lower,bravo,bravo,z]);await expect(rows(page).getByTestId('directory-project-name')).toHaveText([projectName(a),projectName(b),projectName(a),projectName(b),projectName(a)]);
> 17 |   await rows(page).first().getByRole('button',{name:'Open project',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true}).getByRole('checkbox')).toHaveCount(3);for(const [i,t] of [z,bravo,upper].entries())await expect(page.getByTestId('task-row').filter({visible:true}).nth(i).getByRole('checkbox',{name:'Complete '+t,exact:true})).toBeVisible();
     |                                                                                                                                                                                                                                                                                                                                                                            ^ Error: expect(locator).toBeVisible() failed
  18 |   await directory(page,prefix);await expect(title(page)).toHaveText([z,bravo,upper,lower,bravo]);await order(page).selectOption({label:'Title'});await order(page).selectOption({label:'Original'});await expect(title(page)).toHaveText([z,bravo,upper,lower,bravo]);
  19 |  });
  20 |  test('071 directory filters ranges search and bulk updates retain selected order without changing metadata',async({page})=>{
  21 |   const owner='Ordering actions owner',prefix=projectName('Order action'),later=prefix+' alpha',early=prefix+' zulu',undated=prefix+' middle',low=prefix+' low',done=prefix+' done';await createProject(page,owner);await openProject(page,owner);await configured(page,owner,later,'High','2054-02-01');await configured(page,owner,early,'High','2054-01-01');await configured(page,owner,undated,'High');await configured(page,owner,low,'Low','2054-01-01');await configured(page,owner,done,'High','2054-01-01');await page.getByRole('checkbox',{name:'Complete '+done,exact:true}).check();await expectPersistedCompletion(page,owner,done,true);
  22 |   await directory(page,prefix);await expect(title(page)).toHaveText([later,early,undated,low,done]);await order(page).selectOption({label:'Due date'});await expect(title(page)).toHaveText([early,low,done,later,undated]);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(title(page)).toHaveText([early,done,later,undated]);await expect(order(page).locator('option:checked')).toHaveText('Due date');await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2054-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2054-02-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(title(page)).toHaveText([early,done,later]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await expect(title(page)).toHaveText([early,later]);await expect(order(page).locator('option:checked')).toHaveText('Due date');await order(page).selectOption({label:'Title'});await expect(title(page)).toHaveText([later,early]);await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(prefix);await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2054-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2054-02-01');
  23 |   await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();for(const t of [early,later])await expectPersistedCompletion(page,owner,t,true);await expect(page.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(order(page).locator('option:checked')).toHaveText('Title');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await expect(title(page)).toHaveText([later,done,early]);await expect(order(page).locator('option:checked')).toHaveText('Title');await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(prefix+' ALPHA');await page.getByRole('button',{name:'Search directory',exact:true}).click();await expect(title(page)).toHaveText([later]);await expect(order(page).locator('option:checked')).toHaveText('Title');await expect(rows(page).getByTestId('directory-task-priority')).toHaveText('High');await expect(rows(page).getByTestId('directory-task-due-date')).toHaveText('2054-02-01');await expect(rows(page).getByTestId('directory-task-completion')).toHaveText('Completed');
  24 |  });
  25 |  test('072 directory ordering includes deleted archived records and significant internal whitespace',async({page})=>{
  26 |   const owner='Ordering archived first',other='Ordering archived second',third='Ordering archived third',prefix=projectName('Order protected'),single=prefix+' gap task',double=prefix+' gap  task',live=prefix+' archived live guard',active=prefix+' active guard',alpha=prefix+' aardvark';
  27 |   for(const [o,t,priority,date] of [[owner,single,'Low',''],[other,double,'High','2055-01-01'],[third,alpha,'Normal','']]){await createProject(page,o);await openProject(page,o);await configured(page,o,t,priority,date);await taskRow(page,t).getByRole('button',{name:'Delete task',exact:true}).click();const observer=await page.context().newPage();try{await observer.goto('/');await openProject(observer,o);await observer.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(observer,t)).toBeVisible();}finally{await observer.close();}}
  28 |   await page.goto('/');await openProject(page,owner);await createTask(page,live);await page.getByRole('button',{name:'Projects',exact:true}).click();for(const o of [owner,other,third]){await projectRow(page,o).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,o)).toHaveCount(0);}await createProject(page,'Ordering active guard owner');await openProject(page,'Ordering active guard owner');await createTask(page,active);await directory(page,prefix);await expect(title(page)).toHaveText([active]);await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await expect(title(page)).toHaveText([live]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});
  29 |   const literal=async expected=>{await expect.poll(async()=>{try{return await title(page).allTextContents();}catch(error){if(error.message.includes('Execution context was destroyed'))return null;throw error;}}).toEqual(expected);};await literal([single,double,alpha]);for(const [selected,expected,owners] of [['Priority',[double,alpha,single],[other,third,owner]],['Due date',[double,single,alpha],[other,owner,third]],['Title',[alpha,double,single],[third,other,owner]]]){await order(page).selectOption({label:selected});await literal(expected);await expect(rows(page).getByTestId('directory-project-name')).toHaveText(owners.map(projectName));}await expect(page.getByRole('combobox',{name:'Project scope',exact:true}).locator('option:checked')).toHaveText('Archived');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Deleted');await expect(page.getByRole('button',{name:'Complete visible tasks',exact:true})).toBeDisabled();await order(page).selectOption({label:'Original'});await literal([single,double,alpha]);
  30 | 
  31 |  });
  32 |  test('073 directory title ordering folds only ASCII and compares Unicode code points without changing exports',async({page})=>{
  33 |   const owner='Ordering Unicode owner',prefix=projectName('Order Unicode'),lower=prefix+' å',upper=prefix+' Å',astral=prefix+' 🙂',bmp=prefix+' \uE000';await createProject(page,owner);await openProject(page,owner);for(const t of [lower,upper,astral,bmp])await createTask(page,t);await directory(page,prefix);await expect(title(page)).toHaveText([lower,upper,astral,bmp]);await order(page).selectOption({label:'Title'});await expect.poll(async()=>{try{return await title(page).allTextContents();}catch(error){if(error.message.includes('Execution context was destroyed'))return null;throw error;}}).toEqual([upper,lower,bmp,astral]);await rows(page).first().getByRole('button',{name:'Open project',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download project',exact:true}).click();const result=await download,stream=await result.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const snapshot=JSON.parse(Buffer.concat(chunks).toString('utf8'));expect(snapshot.project.tasks.map(t=>t.title)).toEqual([lower,upper,astral,bmp]);
  34 |  });
  35 | }
  36 | 
```