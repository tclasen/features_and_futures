# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notes.spec.mjs >> 052 multiline notes retain literal text filters and archived read-only behavior
- Location: experiments/instruction-effects/revisions/research-v010/decisions/frozen-prefix-drafts/task-015/suite/notes.spec.mjs:10:2

# Error details

```
Error: Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - heading "task-015 Notes values" [level=1] [ref=f5e2]
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
      - option "Low"
      - option "Normal" [selected]
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
    - text: Notes identity
    - group [ref=f5e42]:
      - button "Delete task" [ref=f5e43]
    - checkbox "Complete Notes identity" [ref=f5e45]
    - group [ref=f5e47]:
      - generic [ref=f5e48]:
        - text: Task notes
        - textbox "Task notes last line" [ref=f5e49]: First line Ω Only in notes
        - textbox [ref=f5e50]: last line
      - button "Save notes" [ref=f5e51]
    - group [ref=f5e53]:
      - generic [ref=f5e54]:
        - text: Task due date
        - textbox "Task due date" [ref=f5e55]
      - button "Save due date" [ref=f5e56]
    - group [ref=f5e58]:
      - generic [ref=f5e59]:
        - text: Destination project
        - combobox "Destination project" [ref=f5e60]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f5e61]
    - group [ref=f5e63]:
      - generic [ref=f5e64]:
        - text: New task title
        - textbox "New task title" [ref=f5e65]
      - button "Rename task" [ref=f5e66]
    - generic [ref=f5e68]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e69]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f5e70]:
    - text: Only in notes title sentinel
    - group [ref=f5e72]:
      - button "Delete task" [ref=f5e73]
    - checkbox "Complete Only in notes title sentinel" [ref=f5e75]
    - group [ref=f5e77]:
      - generic [ref=f5e78]:
        - text: Task notes
        - textbox "Task notes" [ref=f5e79]
      - button "Save notes" [ref=f5e80]
    - group [ref=f5e82]:
      - generic [ref=f5e83]:
        - text: Task due date
        - textbox "Task due date" [ref=f5e84]
      - button "Save due date" [ref=f5e85]
    - group [ref=f5e87]:
      - generic [ref=f5e88]:
        - text: Destination project
        - combobox "Destination project" [ref=f5e89]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f5e90]
    - group [ref=f5e92]:
      - generic [ref=f5e93]:
        - text: New task title
        - textbox "New task title" [ref=f5e94]
      - button "Rename task" [ref=f5e95]
    - generic [ref=f5e97]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e98]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority} from './helpers.mjs';
  3  | const notes=(page,title)=>taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true});
  4  | async function saveNotes(page,project,title,value){
  5  |  await notes(page,title).fill(value);await taskRow(page,title).getByRole('button',{name:'Save notes',exact:true}).click();
> 6  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return notes(observer,title).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}
     |                                                                                                                                                                                                         ^ Error: Timeout 5000ms exceeded while waiting on the predicate
  7  | }
  8  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  9  | if(stage>=15){
  10 |  test('052 multiline notes retain literal text filters and archived read-only behavior',async({page})=>{
  11 |   await createProject(page,'Notes values');await openProject(page,'Notes values');await createTask(page,'Notes identity');await expect(notes(page,'Notes identity')).toHaveValue('');await createTask(page,'Only in notes title sentinel');
  12 |   const value='  First line Ω\n  Only in notes\n</textarea><script>window.ffNotesExecuted=true</script><textarea>\nlast line  ';
  13 |   await saveNotes(page,'Notes values','Notes identity',value);await page.reload();await expect(notes(page,'Notes identity')).toHaveValue(value);expect(await page.evaluate(()=>window.ffNotesExecuted)).not.toBe(true);
  14 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('Only in notes');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Only in notes title sentinel')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Notes identity')).toHaveCount(0);await page.getByRole('textbox',{name:'Task search',exact:true}).fill('identity');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Notes identity')).toBeVisible();
  15 |   await taskRow(page,'Notes identity').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Notes values','Notes identity','High');await taskRow(page,'Notes identity').getByRole('textbox',{name:'Task due date',exact:true}).fill('2035-01-01');await taskRow(page,'Notes identity').getByRole('button',{name:'Save due date',exact:true}).click();const dateObserver=await page.context().newPage();try{await expect.poll(async()=>{await dateObserver.goto('/');await openProject(dateObserver,'Notes values');return taskRow(dateObserver,'Notes identity').getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2035-01-01');}finally{await dateObserver.close();}
  16 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2034-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2034-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,'Notes identity')).toHaveCount(0);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2035-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2035-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,'Notes identity')).toBeVisible();await saveNotes(page,'Notes values','Notes identity','');
  17 |   await expect(notes(page,'Notes identity')).toHaveValue('');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('identity');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2035-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2035-01-01');
  18 |   await saveNotes(page,'Notes values','Notes identity',value);await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Notes values').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Notes values')).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Notes values');await expect(notes(page,'Notes identity')).toHaveValue(value);await expect(notes(page,'Notes identity')).toBeDisabled();await expect(taskRow(page,'Notes identity').getByRole('button',{name:'Save notes',exact:true})).toBeDisabled();
  19 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Notes values').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Notes values');await expect(notes(page,'Notes identity')).toHaveValue(value);await expect(notes(page,'Notes identity')).toBeEnabled();await expect(taskRow(page,'Notes identity').getByRole('button',{name:'Save notes',exact:true})).toBeEnabled();
  20 |  });
  21 |  test('053 notes travel through moves and returns while original archived data upgrades',async({page})=>{
  22 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});const old=page.getByTestId('project-row').filter({hasText:'task-014 Persistence renamed'}).filter({visible:true});await old.getByRole('button',{name:'Open project',exact:true}).click();await expect(notes(page,'Memory kept')).toHaveValue('');await expect(notes(page,'Memory kept')).toBeDisabled();
  23 |   await createProject(page,'Notes target');await openProject(page,'Notes target');await createTask(page,'Notes target existing');await createProject(page,'Notes owner');await openProject(page,'Notes owner');for(const title of ['Notes before','Notes travelling','Notes after'])await createTask(page,title);await saveNotes(page,'Notes owner','Notes travelling','Current note\n  retained Unicode λ  ');await expect(notes(page,'Notes before')).toHaveValue('');await expect(notes(page,'Notes after')).toHaveValue('');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await expect(page.getByTestId('task-row').filter({visible:true}).nth(1).getByRole('checkbox',{name:'Complete Notes travelling',exact:true})).toBeVisible();
  24 |   const move=async(source,target)=>{await taskRow(page,'Notes travelling').getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,'Notes travelling').getByRole('button',{name:'Move task',exact:true}).click();await page.goto('/');await openProject(page,target);await expect(notes(page,'Notes travelling')).toHaveValue('Current note\n  retained Unicode λ  ');};
  25 |   await move('Notes owner','Notes target');await move('Notes target','Notes owner');const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(3);for(const [index,title] of ['Notes before','Notes travelling','Notes after'].entries())await expect(rows.nth(index).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();await page.reload();await expect(notes(page,'Notes travelling')).toHaveValue('Current note\n  retained Unicode λ  ');
  26 |  });
  27 | }
  28 | 
```