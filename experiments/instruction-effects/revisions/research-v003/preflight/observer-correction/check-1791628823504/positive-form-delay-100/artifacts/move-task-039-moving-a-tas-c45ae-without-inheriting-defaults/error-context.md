# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 039 moving a task preserves data and destination order without inheriting defaults
- Location: experiments/instruction-effects/revisions/research-v003/preflight/observer-correction/suite/move-task.spec.mjs:14:2

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Matcher error: received value must not be null nor undefined

Received has value: undefined
```

# Page snapshot

```yaml
- generic [active] [ref=f16e1]:
  - heading "task-011 Transfer target" [level=1] [ref=f16e2]
  - group [ref=f16e4]:
    - button "Projects" [ref=f16e5]
  - group [ref=f16e7]:
    - generic [ref=f16e8]:
      - text: Due from
      - textbox "Due from" [ref=f16e9]
    - generic [ref=f16e10]:
      - text: Due through
      - textbox "Due through" [ref=f16e11]
    - button "Apply due range" [ref=f16e12]
  - group [ref=f16e14]:
    - generic [ref=f16e15]:
      - text: New project name
      - textbox "New project name" [ref=f16e16]
    - button "Rename project" [ref=f16e17]
  - generic [ref=f16e19]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f16e20]:
      - option "Low" [selected]
      - option "Normal"
      - option "High"
  - group [ref=f16e22]:
    - generic [ref=f16e23]:
      - text: Task title
      - textbox "Task title" [ref=f16e24]
    - button "Create task" [ref=f16e25]
  - generic [ref=f16e27]:
    - text: Task filter
    - combobox "Task filter" [ref=f16e28]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f16e30]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f16e31]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f16e32]:
    - text: Target first
    - checkbox "Complete Target first" [ref=f16e34]
    - group [ref=f16e36]:
      - generic [ref=f16e37]:
        - text: Task due date
        - textbox "Task due date" [ref=f16e38]
      - button "Save due date" [ref=f16e39]
    - group [ref=f16e41]:
      - generic [ref=f16e42]:
        - text: Destination project
        - combobox "Destination project" [ref=f16e43]:
          - option "task-011 Filtered moving" [selected]
          - option "task-011 Defaults independent"
          - option "task-011 Defaults inheritance"
          - option "task-011 Defaults renamed"
          - option "task-011 Calendar persistence"
          - option "task-011 Calendar validation"
          - option "task-011 Calendar independence"
          - option "task-011 Calendar second owner"
          - option "task-011 Calendar archival"
          - option "task-011 Range boundaries"
          - option "task-011 Range intersections"
          - option "task-011 Range validation"
          - option "task-011 Range archival"
          - option "task-011 Range owner renamed"
          - option "task-011 Transfer source"
      - button "Move task" [ref=f16e44]
    - group [ref=f16e46]:
      - generic [ref=f16e47]:
        - text: New task title
        - textbox "New task title" [ref=f16e48]
      - button "Rename task" [ref=f16e49]
    - generic [ref=f16e51]:
      - text: Task priority
      - combobox "Task priority" [ref=f16e52]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f16e53]:
    - text: Target second
    - checkbox "Complete Target second" [ref=f16e55]
    - group [ref=f16e57]:
      - generic [ref=f16e58]:
        - text: Task due date
        - textbox "Task due date" [ref=f16e59]
      - button "Save due date" [ref=f16e60]
    - group [ref=f16e62]:
      - generic [ref=f16e63]:
        - text: Destination project
        - combobox "Destination project" [ref=f16e64]:
          - option "task-011 Filtered moving" [selected]
          - option "task-011 Defaults independent"
          - option "task-011 Defaults inheritance"
          - option "task-011 Defaults renamed"
          - option "task-011 Calendar persistence"
          - option "task-011 Calendar validation"
          - option "task-011 Calendar independence"
          - option "task-011 Calendar second owner"
          - option "task-011 Calendar archival"
          - option "task-011 Range boundaries"
          - option "task-011 Range intersections"
          - option "task-011 Range validation"
          - option "task-011 Range archival"
          - option "task-011 Range owner renamed"
          - option "task-011 Transfer source"
      - button "Move task" [ref=f16e65]
    - group [ref=f16e67]:
      - generic [ref=f16e68]:
        - text: New task title
        - textbox "New task title" [ref=f16e69]
      - button "Rename task" [ref=f16e70]
    - generic [ref=f16e72]:
      - text: Task priority
      - combobox "Task priority" [ref=f16e73]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f16e74]:
    - text: Transferred complete
    - checkbox "Complete Transferred complete" [checked] [ref=f16e76]
    - group [ref=f16e78]:
      - generic [ref=f16e79]:
        - text: Task due date
        - textbox "Task due date" [ref=f16e80]: 2032-02-29
      - button "Save due date" [ref=f16e81]
    - group [ref=f16e83]:
      - generic [ref=f16e84]:
        - text: Destination project
        - combobox "Destination project" [ref=f16e85]:
          - option "task-011 Filtered moving" [selected]
          - option "task-011 Defaults independent"
          - option "task-011 Defaults inheritance"
          - option "task-011 Defaults renamed"
          - option "task-011 Calendar persistence"
          - option "task-011 Calendar validation"
          - option "task-011 Calendar independence"
          - option "task-011 Calendar second owner"
          - option "task-011 Calendar archival"
          - option "task-011 Range boundaries"
          - option "task-011 Range intersections"
          - option "task-011 Range validation"
          - option "task-011 Range archival"
          - option "task-011 Range owner renamed"
          - option "task-011 Transfer source"
      - button "Move task" [ref=f16e86]
    - group [ref=f16e88]:
      - generic [ref=f16e89]:
        - text: New task title
        - textbox "New task title" [ref=f16e90]
      - button "Rename task" [ref=f16e91]
    - generic [ref=f16e93]:
      - text: Task priority
      - combobox "Task priority" [ref=f16e94]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
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
> 22 |   let rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Target first');expect(rows[1]).toContain('Target second');expect(rows[2]).toContain('Transferred complete');await expect(page.getByRole('checkbox',{name:'Complete Transferred complete',exact:true})).toBeChecked();await expect(taskRow(page,'Transferred complete').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,'Transferred complete').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2032-02-29');
     |                                                                                                        ^ Error: expect(received).toContain(expected) // indexOf
  23 |   await page.reload();await expect(taskRow(page,'Transferred complete')).toBeVisible();
  24 |  });
  25 |  test('040 moving under combined filters retains source range and independent data',async({page})=>{
  26 |   await createProject(page,'Filtered transfer target');await createProject(page,'Filtered transfer source');await openProject(page,'Filtered transfer source');
  27 |   for(const title of ['Filtered first','Filtered moving','Filtered last']){await createTask(page,title);await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Filtered transfer source',title,'High');await setDate(page,'Filtered transfer source',title,'2033-01-01');}
  28 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2033-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2033-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();
  29 |   await destination(page,'Filtered moving').selectOption({label:projectName('Filtered transfer target')});await move(page,'Filtered moving').click();await persistedLocation(page,'Filtered transfer source','Filtered transfer target','Filtered moving','0/2 completed');
  30 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2033-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2033-01-01');
  31 |   let rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows).toHaveLength(2);expect(rows[0]).toContain('Filtered first');expect(rows[1]).toContain('Filtered last');
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