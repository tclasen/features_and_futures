# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 041 destination choices use active current project names in creation order
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-015-draft/suite/move-task.spec.mjs:33:2

# Error details

```
Error: expect(received).not.toContain(expected) // indexOf

Expected value: not "task-015 Options hidden"
Received array:     ["task-005 Persistence renamed", "task-007 Persistence renamed", "task-008 Persistence renamed", "task-009 Persistence renamed", "task-010 Persistence renamed", "task-011 Persistence renamed", "task-012 Persistence renamed", "task-012 Position first owner", "task-013 Persistence renamed", "task-012 Position second owner", "task-014 Persistence renamed", "task-012 Search Mixed first", "task-012 Search mixed last", "task-012 Search MIXED archived", "task-012 Search  double gap", "task-012 Whitespace   Saved first", "task-015 Options first", "task-015 Options hidden", "task-015 Options second"]
```

# Page snapshot

```yaml
- generic [active] [ref=f10e1]:
  - heading "task-015 Options owner" [level=1] [ref=f10e2]
  - group [ref=f10e4]:
    - button "Projects" [ref=f10e5]
  - group [ref=f10e7]:
    - generic [ref=f10e8]:
      - text: Task search
      - textbox "Task search" [ref=f10e9]
    - button "Search tasks" [ref=f10e10]
  - group [ref=f10e12]:
    - generic [ref=f10e13]:
      - text: Due from
      - textbox "Due from" [ref=f10e14]
    - generic [ref=f10e15]:
      - text: Due through
      - textbox "Due through" [ref=f10e16]
    - button "Apply due range" [ref=f10e17]
  - group [ref=f10e19]:
    - generic [ref=f10e20]:
      - text: New project name
      - textbox "New project name" [ref=f10e21]
    - button "Rename project" [ref=f10e22]
  - generic [ref=f10e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f10e25]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f10e27]:
    - generic [ref=f10e28]:
      - text: Task title
      - textbox "Task title" [ref=f10e29]
    - button "Create task" [ref=f10e30]
  - generic [ref=f10e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f10e33]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f10e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f10e36]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f10e37]:
    - text: Options task
    - checkbox "Complete Options task" [ref=f10e39]
    - group [ref=f10e41]:
      - generic [ref=f10e42]:
        - text: Task notes
        - textbox "Task notes" [ref=f10e43]
      - button "Save notes" [ref=f10e44]
    - group [ref=f10e46]:
      - generic [ref=f10e47]:
        - text: Task due date
        - textbox "Task due date" [ref=f10e48]
      - button "Save due date" [ref=f10e49]
    - group [ref=f10e51]:
      - generic [ref=f10e52]:
        - text: Destination project
        - combobox "Destination project" [ref=f10e53]:
          - option "task-005 Persistence renamed" [selected]
          - option "task-007 Persistence renamed"
          - option "task-008 Persistence renamed"
          - option "task-009 Persistence renamed"
          - option "task-010 Persistence renamed"
          - option "task-011 Persistence renamed"
          - option "task-012 Persistence renamed"
          - option "task-012 Position first owner"
          - option "task-013 Persistence renamed"
          - option "task-012 Position second owner"
          - option "task-014 Persistence renamed"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search MIXED archived"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-015 Options first"
          - option "task-015 Options hidden"
          - option "task-015 Options second"
      - button "Move task" [ref=f10e54]
    - group [ref=f10e56]:
      - generic [ref=f10e57]:
        - text: New task title
        - textbox "New task title" [ref=f10e58]
      - button "Rename task" [ref=f10e59]
    - generic [ref=f10e61]:
      - text: Task priority
      - combobox "Task priority" [ref=f10e62]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3  | const destination=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Destination project',exact:true});
  4  | const move=(page,title)=>taskRow(page,title).getByRole('button',{name:'Move task',exact:true});
  5  | async function persistedLocation(page,source,target,title,sourceSummary){
  6  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,target);await expect(taskRow(observer,title)).toBeVisible();const count=await taskRow(observer,title).count();await observer.goto('/');if(sourceSummary)await expect(projectRow(observer,source).getByTestId('project-summary')).toHaveText(sourceSummary);await openProject(observer,source);return [count,await taskRow(observer,title).count()];},{timeout:5000}).toEqual([1,0]);}finally{await observer.close();}
  7  | }
  8  | async function setDate(page,project,title,value){
  9  |  await taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:'Save due date',exact:true}).click();
  10 |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}
  11 | }
  12 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  13 | if(stage>=11){
  14 |  test('039 moving a task preserves data and destination order without inheriting defaults',async({page})=>{
  15 |   await createProject(page,'Transfer target');await openProject(page,'Transfer target');await createTask(page,'Target first');await createTask(page,'Target second');
  16 |   await page.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:'Low'});
  17 |   const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Transfer target');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');}finally{await observer.close();}
  18 |   await createProject(page,'Transfer source');await openProject(page,'Transfer source');await createTask(page,'Transferred complete');await createTask(page,'Source remaining');
  19 |   await taskRow(page,'Transferred complete').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Transfer source','Transferred complete','High');await page.getByRole('checkbox',{name:'Complete Transferred complete',exact:true}).check();await expectPersistedCompletion(page,'Transfer source','Transferred complete',true);await setDate(page,'Transfer source','Transferred complete','2032-02-29');
  20 |   await destination(page,'Transferred complete').selectOption({label:projectName('Transfer target')});await move(page,'Transferred complete').click();await persistedLocation(page,'Transfer source','Transfer target','Transferred complete','0/1 completed');await expect(taskRow(page,'Transferred complete')).toHaveCount(0);await expect(taskRow(page,'Source remaining')).toBeVisible();
  21 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Transfer source').getByTestId('project-summary')).toHaveText('0/1 completed');await expect(projectRow(page,'Transfer target').getByTestId('project-summary')).toHaveText('1/3 completed');await openProject(page,'Transfer target');
  22 |   const targetRows=page.getByTestId('task-row').filter({visible:true});await expect(targetRows).toHaveCount(3);for(const [i,title] of ['Target first','Target second','Transferred complete'].entries())await expect(targetRows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Complete Transferred complete',exact:true})).toBeChecked();await expect(taskRow(page,'Transferred complete').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,'Transferred complete').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2032-02-29');
  23 |   await page.reload();await expect(taskRow(page,'Transferred complete')).toBeVisible();
  24 |  });
  25 |  test('040 moving under combined filters retains source range and independent data',async({page})=>{
  26 |   await createProject(page,'Filtered transfer target');await createProject(page,'Filtered transfer source');await openProject(page,'Filtered transfer source');
  27 |   for(const title of ['Filtered first','Filtered moving','Filtered last']){await createTask(page,title);await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Filtered transfer source',title,'High');await setDate(page,'Filtered transfer source',title,'2033-01-01');}
  28 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2033-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2033-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();
  29 |   await destination(page,'Filtered moving').selectOption({label:projectName('Filtered transfer target')});await move(page,'Filtered moving').click();await persistedLocation(page,'Filtered transfer source','Filtered transfer target','Filtered moving','0/2 completed');
  30 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2033-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2033-01-01');
  31 |   const filteredRows=page.getByTestId('task-row').filter({visible:true});await expect(filteredRows).toHaveCount(2);for(const [i,title] of ['Filtered first','Filtered last'].entries())await expect(filteredRows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();
  32 |  });
  33 |  test('041 destination choices use active current project names in creation order',async({page})=>{
  34 |   await createProject(page,'Options first');await createProject(page,'Options hidden');await projectRow(page,'Options hidden').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Options hidden')).toHaveCount(0);await createProject(page,'Options second');await createProject(page,'Options owner');await openProject(page,'Options owner');await createTask(page,'Options task');
> 35 |   const names=await destination(page,'Options task').locator('option').allTextContents();expect(names).toContain(projectName('Options first'));expect(names).toContain(projectName('Options second'));expect(names).not.toContain(projectName('Options owner'));expect(names).not.toContain(projectName('Options hidden'));expect(names.indexOf(projectName('Options first'))).toBeLessThan(names.indexOf(projectName('Options second')));
     |                                                                                                                                                                                                                                                                                   ^ Error: expect(received).not.toContain(expected) // indexOf
  36 |  });
  37 |  test('042 archived source moves are disabled restoration allows moving an undated task',async({page})=>{
  38 |   await createProject(page,'Read-only transfer target');await createProject(page,'Read-only transfer owner');await openProject(page,'Read-only transfer owner');await createTask(page,'Undated transfer');await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Read-only transfer owner').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Read-only transfer owner')).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Read-only transfer owner');await expect(destination(page,'Undated transfer')).toBeDisabled();await expect(move(page,'Undated transfer')).toBeDisabled();
  39 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Read-only transfer owner').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Read-only transfer owner');await expect(destination(page,'Undated transfer')).toBeEnabled();await expect(move(page,'Undated transfer')).toBeEnabled();await destination(page,'Undated transfer').selectOption({label:projectName('Read-only transfer target')});await move(page,'Undated transfer').click();await persistedLocation(page,'Read-only transfer owner','Read-only transfer target','Undated transfer','0/0 completed');await page.goto('/');await openProject(page,'Read-only transfer target');await expect(taskRow(page,'Undated transfer').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('');await expect(taskRow(page,'Undated transfer').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await expect(page.getByRole('checkbox',{name:'Complete Undated transfer',exact:true})).not.toBeChecked();
  40 |   await destination(page,'Undated transfer').selectOption({label:projectName('Read-only transfer owner')});await move(page,'Undated transfer').click();await persistedLocation(page,'Read-only transfer target','Read-only transfer owner','Undated transfer','0/0 completed');
  41 |  });
  42 | }
  43 | 
```