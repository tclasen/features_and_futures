# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 040 moving under combined filters retains source range and independent data
- Location: experiments/instruction-effects/revisions/research-v006/decisions/task-020-draft/suite/move-task.spec.mjs:26:2

# Error details

```
Error: Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f23e1]:
  - heading "task-020 Filtered transfer source" [level=1] [ref=f23e2]
  - group [ref=f23e4]:
    - button "Download project" [ref=f23e5]
  - group [ref=f23e7]:
    - button "Projects" [ref=f23e8]
  - group [ref=f23e10]:
    - generic [ref=f23e11]:
      - text: Task search
      - textbox "Task search" [ref=f23e12]
    - button "Search tasks" [ref=f23e13]
  - group [ref=f23e15]:
    - generic [ref=f23e16]:
      - text: Due from
      - textbox "Due from" [ref=f23e17]: 2033-01-01
    - generic [ref=f23e18]:
      - text: Due through
      - textbox "Due through" [ref=f23e19]: 2033-01-01
    - button "Apply due range" [ref=f23e20]
  - group [ref=f23e22]:
    - generic [ref=f23e23]:
      - text: New project name
      - textbox "New project name" [ref=f23e24]
    - button "Rename project" [ref=f23e25]
  - generic [ref=f23e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f23e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f23e30]:
    - generic [ref=f23e31]:
      - text: Task title
      - textbox "Task title" [ref=f23e32]
    - button "Create task" [ref=f23e33]
  - generic [ref=f23e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f23e36]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
      - option "Deleted"
  - generic [ref=f23e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f23e39]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f23e40]:
    - text: Filtered first
    - group [ref=f23e42]:
      - button "Delete task" [ref=f23e43]
    - checkbox "Complete Filtered first" [ref=f23e45]
    - group [ref=f23e47]:
      - generic [ref=f23e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f23e49]
      - button "Save notes" [ref=f23e50]
    - group [ref=f23e52]:
      - generic [ref=f23e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f23e54]: 2033-01-01
      - button "Save due date" [ref=f23e55]
    - group [ref=f23e57]:
      - generic [ref=f23e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f23e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-020 Filtered transfer target"
      - button "Move task" [ref=f23e60]
    - group [ref=f23e62]:
      - generic [ref=f23e63]:
        - text: New task title
        - textbox "New task title" [ref=f23e64]
      - button "Rename task" [ref=f23e65]
    - generic [ref=f23e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f23e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f23e69]:
    - text: Filtered moving
    - group [ref=f23e71]:
      - button "Delete task" [ref=f23e72]
    - checkbox "Complete Filtered moving" [ref=f23e74]
    - group [ref=f23e76]:
      - generic [ref=f23e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f23e78]
      - button "Save notes" [ref=f23e79]
    - group [ref=f23e81]:
      - generic [ref=f23e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f23e83]: 2033-01-01
      - button "Save due date" [ref=f23e84]
    - group [ref=f23e86]:
      - generic [ref=f23e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f23e88]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-020 Filtered transfer target"
      - button "Move task" [ref=f23e89]
    - group [ref=f23e91]:
      - generic [ref=f23e92]:
        - text: New task title
        - textbox "New task title" [ref=f23e93]
      - button "Rename task" [ref=f23e94]
    - generic [ref=f23e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f23e97]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f23e98]:
    - text: Filtered last
    - group [ref=f23e100]:
      - button "Delete task" [ref=f23e101]
    - checkbox "Complete Filtered last" [ref=f23e103]
    - group [ref=f23e105]:
      - generic [ref=f23e106]:
        - text: Task notes
        - textbox "Task notes" [ref=f23e107]
      - button "Save notes" [ref=f23e108]
    - group [ref=f23e110]:
      - generic [ref=f23e111]:
        - text: Task due date
        - textbox "Task due date" [ref=f23e112]: 2033-01-01
      - button "Save due date" [ref=f23e113]
    - group [ref=f23e115]:
      - generic [ref=f23e116]:
        - text: Destination project
        - combobox "Destination project" [ref=f23e117]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-020 Filtered transfer target"
      - button "Move task" [ref=f23e118]
    - group [ref=f23e120]:
      - generic [ref=f23e121]:
        - text: New task title
        - textbox "New task title" [ref=f23e122]
      - button "Rename task" [ref=f23e123]
    - generic [ref=f23e125]:
      - text: Task priority
      - combobox "Task priority" [ref=f23e126]:
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
  5  | const sentinel={'Transfer source':'Source remaining','Transfer target':'Target first','Filtered transfer source':'Filtered first','Filtered transfer target':'Filtered target sentinel','Read-only transfer owner':'Undated owner sentinel','Read-only transfer target':'Undated target sentinel'};
  6  | async function persistedLocation(page,source,target,title,sourceSummary){
> 7  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,target);await expect(taskRow(observer,sentinel[target])).toBeVisible();const count=await taskRow(observer,title).count();if(count!==1)return [count,-1];await observer.goto('/');if(sourceSummary)await expect(projectRow(observer,source).getByTestId('project-summary')).toHaveText(sourceSummary);await openProject(observer,source);await expect(taskRow(observer,sentinel[source])).toBeVisible();return [count,await taskRow(observer,title).count()];},{timeout:5000}).toEqual([1,0]);}finally{await observer.close();}
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ^ Error: Timeout 5000ms exceeded while waiting on the predicate
  8  | }
  9  | async function setDate(page,project,title,value){
  10 |  await taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:'Save due date',exact:true}).click();
  11 |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}
  12 | }
  13 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  14 | if(stage>=11){
  15 |  test('039 moving a task preserves data and destination order without inheriting defaults',async({page})=>{
  16 |   await createProject(page,'Transfer target');await openProject(page,'Transfer target');await createTask(page,'Target first');await createTask(page,'Target second');
  17 |   await page.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:'Low'});
  18 |   const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Transfer target');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');}finally{await observer.close();}
  19 |   await createProject(page,'Transfer source');await openProject(page,'Transfer source');await createTask(page,'Transferred complete');await createTask(page,'Source remaining');
  20 |   await taskRow(page,'Transferred complete').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Transfer source','Transferred complete','High');await page.getByRole('checkbox',{name:'Complete Transferred complete',exact:true}).check();await expectPersistedCompletion(page,'Transfer source','Transferred complete',true);await setDate(page,'Transfer source','Transferred complete','2032-02-29');
  21 |   await destination(page,'Transferred complete').selectOption({label:projectName('Transfer target')});await move(page,'Transferred complete').click();await persistedLocation(page,'Transfer source','Transfer target','Transferred complete','0/1 completed');await expect(taskRow(page,'Transferred complete')).toHaveCount(0);await expect(taskRow(page,'Source remaining')).toBeVisible();
  22 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Transfer source').getByTestId('project-summary')).toHaveText('0/1 completed');await expect(projectRow(page,'Transfer target').getByTestId('project-summary')).toHaveText('1/3 completed');await openProject(page,'Transfer target');
  23 |   const targetRows=page.getByTestId('task-row').filter({visible:true});await expect(targetRows).toHaveCount(3);for(const [i,title] of ['Target first','Target second','Transferred complete'].entries())await expect(targetRows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Complete Transferred complete',exact:true})).toBeChecked();await expect(taskRow(page,'Transferred complete').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,'Transferred complete').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2032-02-29');
  24 |   await page.reload();await expect(taskRow(page,'Transferred complete')).toBeVisible();
  25 |  });
  26 |  test('040 moving under combined filters retains source range and independent data',async({page})=>{
  27 |   await createProject(page,'Filtered transfer target');await openProject(page,'Filtered transfer target');await createTask(page,'Filtered target sentinel');await createProject(page,'Filtered transfer source');await openProject(page,'Filtered transfer source');
  28 |   for(const title of ['Filtered first','Filtered moving','Filtered last']){await createTask(page,title);await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Filtered transfer source',title,'High');await setDate(page,'Filtered transfer source',title,'2033-01-01');}
  29 |   await createTask(page,'Filtered outside range');await taskRow(page,'Filtered outside range').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Filtered transfer source','Filtered outside range','High');await setDate(page,'Filtered transfer source','Filtered outside range','2034-01-01');
  30 |   await createTask(page,'Filtered completed guard');await taskRow(page,'Filtered completed guard').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Filtered transfer source','Filtered completed guard','High');await page.getByRole('checkbox',{name:'Complete Filtered completed guard',exact:true}).check();await expectPersistedCompletion(page,'Filtered transfer source','Filtered completed guard',true);await createTask(page,'Filtered normal guard');
  31 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await expect(taskRow(page,'Filtered completed guard')).toHaveCount(0);await expect(taskRow(page,'Filtered normal guard')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(5);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Filtered normal guard')).toHaveCount(0);await expect(taskRow(page,'Filtered outside range')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2033-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2033-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();
  32 |   await expect(taskRow(page,'Filtered outside range')).toHaveCount(0);await expect(taskRow(page,'Filtered moving')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);
  33 |   await destination(page,'Filtered moving').selectOption({label:projectName('Filtered transfer target')});await move(page,'Filtered moving').click();await persistedLocation(page,'Filtered transfer source','Filtered transfer target','Filtered moving','1/5 completed');
  34 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2033-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2033-01-01');
  35 |   const filteredRows=page.getByTestId('task-row').filter({visible:true});await expect(filteredRows).toHaveCount(2);for(const [i,title] of ['Filtered first','Filtered last'].entries())await expect(filteredRows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();
  36 |  });
  37 |  test('041 destination choices use active current project names in creation order',async({page})=>{
  38 |   await createProject(page,'Options first');await createProject(page,'Options hidden');await projectRow(page,'Options hidden').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Options hidden')).toHaveCount(0);await createProject(page,'Options second');await createProject(page,'Options owner');await openProject(page,'Options owner');await createTask(page,'Options task');
  39 |   const names=await destination(page,'Options task').locator('option').allTextContents();expect(names).toContain(projectName('Options first'));expect(names).toContain(projectName('Options second'));expect(names).not.toContain(projectName('Options owner'));expect(names).not.toContain(projectName('Options hidden'));expect(names.indexOf(projectName('Options first'))).toBeLessThan(names.indexOf(projectName('Options second')));
  40 |  });
  41 |  test('042 archived source moves are disabled restoration allows moving an undated task',async({page})=>{
  42 |   await createProject(page,'Read-only transfer target');await openProject(page,'Read-only transfer target');await createTask(page,'Undated target sentinel');await createProject(page,'Read-only transfer owner');await openProject(page,'Read-only transfer owner');await createTask(page,'Undated transfer');await createTask(page,'Undated owner sentinel');await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Read-only transfer owner').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Read-only transfer owner')).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Read-only transfer owner');await expect(destination(page,'Undated transfer')).toBeDisabled();await expect(move(page,'Undated transfer')).toBeDisabled();
  43 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Read-only transfer owner').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Read-only transfer owner');await expect(destination(page,'Undated transfer')).toBeEnabled();await expect(move(page,'Undated transfer')).toBeEnabled();await destination(page,'Undated transfer').selectOption({label:projectName('Read-only transfer target')});await move(page,'Undated transfer').click();await persistedLocation(page,'Read-only transfer owner','Read-only transfer target','Undated transfer','0/1 completed');await page.goto('/');await openProject(page,'Read-only transfer target');await expect(taskRow(page,'Undated transfer').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('');await expect(taskRow(page,'Undated transfer').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await expect(page.getByRole('checkbox',{name:'Complete Undated transfer',exact:true})).not.toBeChecked();
  44 |   await destination(page,'Undated transfer').selectOption({label:projectName('Read-only transfer owner')});await move(page,'Undated transfer').click();await persistedLocation(page,'Read-only transfer target','Read-only transfer owner','Undated transfer','0/1 completed');
  45 |  });
  46 | }
  47 | 
```