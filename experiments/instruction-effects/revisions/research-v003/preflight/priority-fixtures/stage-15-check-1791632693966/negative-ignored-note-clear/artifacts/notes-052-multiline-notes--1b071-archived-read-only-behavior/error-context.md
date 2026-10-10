# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notes.spec.mjs >> 052 multiline notes retain literal text filters and archived read-only behavior
- Location: experiments/instruction-effects/revisions/research-v003/decisions/task-015-draft/suite/notes.spec.mjs:10:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: ""
Received: "  First line Ω
  Only in notes
</textarea><script>window.ffNotesExecuted=true</script><textarea>
last line  "

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f14e1]:
  - heading "task-015 Notes values" [level=1] [ref=f14e2]
  - group [ref=f14e4]:
    - button "Projects" [ref=f14e5]
  - group [ref=f14e7]:
    - generic [ref=f14e8]:
      - text: Task search
      - textbox "Task search" [ref=f14e9]: identity
    - button "Search tasks" [ref=f14e10]
  - group [ref=f14e12]:
    - generic [ref=f14e13]:
      - text: Due from
      - textbox "Due from" [ref=f14e14]: 2035-01-01
    - generic [ref=f14e15]:
      - text: Due through
      - textbox "Due through" [ref=f14e16]: 2035-01-01
    - button "Apply due range" [ref=f14e17]
  - group [ref=f14e19]:
    - generic [ref=f14e20]:
      - text: New project name
      - textbox "New project name" [ref=f14e21]
    - button "Rename project" [ref=f14e22]
  - generic [ref=f14e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f14e25]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f14e27]:
    - generic [ref=f14e28]:
      - text: Task title
      - textbox "Task title" [ref=f14e29]
    - button "Create task" [ref=f14e30]
  - generic [ref=f14e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f14e33]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
  - generic [ref=f14e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f14e36]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f14e37]:
    - text: Notes identity
    - checkbox "Complete Notes identity" [ref=f14e39]
    - group [ref=f14e41]:
      - generic [ref=f14e42]:
        - text: Task notes
        - textbox "Task notes" [ref=f14e43]: First line Ω Only in notes </textarea><script>window.ffNotesExecuted=true</script><textarea> last line
      - button "Save notes" [ref=f14e44]
    - group [ref=f14e46]:
      - generic [ref=f14e47]:
        - text: Task due date
        - textbox "Task due date" [ref=f14e48]: 2035-01-01
      - button "Save due date" [ref=f14e49]
    - group [ref=f14e51]:
      - generic [ref=f14e52]:
        - text: Destination project
        - combobox "Destination project" [ref=f14e53]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
      - button "Move task" [ref=f14e54]
    - group [ref=f14e56]:
      - generic [ref=f14e57]:
        - text: New task title
        - textbox "New task title" [ref=f14e58]
      - button "Rename task" [ref=f14e59]
    - generic [ref=f14e61]:
      - text: Task priority
      - combobox "Task priority" [ref=f14e62]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority} from './helpers.mjs';
  3  | const notes=(page,title)=>taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true});
  4  | async function saveNotes(page,project,title,value){
  5  |  await notes(page,title).fill(value);await taskRow(page,title).getByRole('button',{name:'Save notes',exact:true}).click();
> 6  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return notes(observer,title).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}
     |                                                                                                                                                                                                         ^ Error: expect(received).toBe(expected) // Object.is equality
  7  | }
  8  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  9  | if(stage>=15){
  10 |  test('052 multiline notes retain literal text filters and archived read-only behavior',async({page})=>{
  11 |   await createProject(page,'Notes values');await openProject(page,'Notes values');await createTask(page,'Notes identity');await expect(notes(page,'Notes identity')).toHaveValue('');await createTask(page,'Only in notes title sentinel');
  12 |   const value='  First line Ω\n  Only in notes\n</textarea><script>window.ffNotesExecuted=true</script><textarea>\nlast line  ';
  13 |   await saveNotes(page,'Notes values','Notes identity',value);await page.reload();await expect(notes(page,'Notes identity')).toHaveValue(value);expect(await page.evaluate(()=>window.ffNotesExecuted)).not.toBe(true);
  14 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('Only in notes');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Only in notes title sentinel')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Notes identity')).toHaveCount(0);await page.getByRole('textbox',{name:'Task search',exact:true}).fill('identity');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Notes identity')).toBeVisible();
  15 |   await taskRow(page,'Notes identity').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Notes values','Notes identity','High');await taskRow(page,'Notes identity').getByRole('textbox',{name:'Task due date',exact:true}).fill('2035-01-01');await taskRow(page,'Notes identity').getByRole('button',{name:'Save due date',exact:true}).click();const dateObserver=await page.context().newPage();try{await expect.poll(async()=>{await dateObserver.goto('/');await openProject(dateObserver,'Notes values');return taskRow(dateObserver,'Notes identity').getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2035-01-01');}finally{await dateObserver.close();}
  16 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2035-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2035-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await saveNotes(page,'Notes values','Notes identity','');
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