# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 039 moving a task preserves data and destination order without inheriting defaults
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-019-draft/suite/move-task.spec.mjs:14:2

# Error details

```
Error: Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f14e1]:
  - heading "task-019 Transfer source" [level=1] [ref=f14e2]
  - group [ref=f14e4]:
    - button "Download project" [ref=f14e5]
  - group [ref=f14e7]:
    - button "Projects" [ref=f14e8]
  - group [ref=f14e10]:
    - generic [ref=f14e11]:
      - text: Task search
      - textbox "Task search" [ref=f14e12]
    - button "Search tasks" [ref=f14e13]
  - group [ref=f14e15]:
    - generic [ref=f14e16]:
      - text: Due from
      - textbox "Due from" [ref=f14e17]
    - generic [ref=f14e18]:
      - text: Due through
      - textbox "Due through" [ref=f14e19]
    - button "Apply due range" [ref=f14e20]
  - group [ref=f14e22]:
    - generic [ref=f14e23]:
      - text: New project name
      - textbox "New project name" [ref=f14e24]
    - button "Rename project" [ref=f14e25]
  - generic [ref=f14e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f14e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f14e30]:
    - generic [ref=f14e31]:
      - text: Task title
      - textbox "Task title" [ref=f14e32]
    - button "Create task" [ref=f14e33]
  - generic [ref=f14e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f14e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f14e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f14e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f14e40]:
    - text: Transferred complete
    - group [ref=f14e42]:
      - button "Delete task" [ref=f14e43]
    - checkbox "Complete Transferred complete" [checked] [ref=f14e45]
    - group [ref=f14e47]:
      - generic [ref=f14e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f14e49]
      - button "Save notes" [ref=f14e50]
    - group [ref=f14e52]:
      - generic [ref=f14e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f14e54]: 2032-02-29
      - button "Save due date" [ref=f14e55]
    - group [ref=f14e57]:
      - generic [ref=f14e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f14e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-019 Transfer target"
      - button "Move task" [ref=f14e60]
    - group [ref=f14e62]:
      - generic [ref=f14e63]:
        - text: New task title
        - textbox "New task title" [ref=f14e64]
      - button "Rename task" [ref=f14e65]
    - generic [ref=f14e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f14e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f14e69]:
    - text: Source remaining
    - group [ref=f14e71]:
      - button "Delete task" [ref=f14e72]
    - checkbox "Complete Source remaining" [ref=f14e74]
    - group [ref=f14e76]:
      - generic [ref=f14e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f14e78]
      - button "Save notes" [ref=f14e79]
    - group [ref=f14e81]:
      - generic [ref=f14e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f14e83]
      - button "Save due date" [ref=f14e84]
    - group [ref=f14e86]:
      - generic [ref=f14e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f14e88]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-019 Transfer target"
      - button "Move task" [ref=f14e89]
    - group [ref=f14e91]:
      - generic [ref=f14e92]:
        - text: New task title
        - textbox "New task title" [ref=f14e93]
      - button "Rename task" [ref=f14e94]
    - generic [ref=f14e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f14e97]:
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
> 6  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,target);await expect(taskRow(observer,title)).toBeVisible();const count=await taskRow(observer,title).count();await observer.goto('/');if(sourceSummary)await expect(projectRow(observer,source).getByTestId('project-summary')).toHaveText(sourceSummary);await openProject(observer,source);return [count,await taskRow(observer,title).count()];},{timeout:5000}).toEqual([1,0]);}finally{await observer.close();}
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         ^ Error: Timeout 5000ms exceeded while waiting on the predicate
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
  35 |   const names=await destination(page,'Options task').locator('option').allTextContents();expect(names).toContain(projectName('Options first'));expect(names).toContain(projectName('Options second'));expect(names).not.toContain(projectName('Options owner'));expect(names).not.toContain(projectName('Options hidden'));expect(names.indexOf(projectName('Options first'))).toBeLessThan(names.indexOf(projectName('Options second')));
  36 |  });
  37 |  test('042 archived source moves are disabled restoration allows moving an undated task',async({page})=>{
  38 |   await createProject(page,'Read-only transfer target');await createProject(page,'Read-only transfer owner');await openProject(page,'Read-only transfer owner');await createTask(page,'Undated transfer');await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Read-only transfer owner').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Read-only transfer owner')).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Read-only transfer owner');await expect(destination(page,'Undated transfer')).toBeDisabled();await expect(move(page,'Undated transfer')).toBeDisabled();
  39 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Read-only transfer owner').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Read-only transfer owner');await expect(destination(page,'Undated transfer')).toBeEnabled();await expect(move(page,'Undated transfer')).toBeEnabled();await destination(page,'Undated transfer').selectOption({label:projectName('Read-only transfer target')});await move(page,'Undated transfer').click();await persistedLocation(page,'Read-only transfer owner','Read-only transfer target','Undated transfer','0/0 completed');await page.goto('/');await openProject(page,'Read-only transfer target');await expect(taskRow(page,'Undated transfer').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('');await expect(taskRow(page,'Undated transfer').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await expect(page.getByRole('checkbox',{name:'Complete Undated transfer',exact:true})).not.toBeChecked();
  40 |   await destination(page,'Undated transfer').selectOption({label:projectName('Read-only transfer owner')});await move(page,'Undated transfer').click();await persistedLocation(page,'Read-only transfer target','Read-only transfer owner','Undated transfer','0/0 completed');
  41 |  });
  42 | }
  43 | 
```