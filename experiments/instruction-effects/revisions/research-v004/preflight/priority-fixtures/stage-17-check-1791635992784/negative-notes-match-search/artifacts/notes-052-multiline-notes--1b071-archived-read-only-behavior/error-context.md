# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notes.spec.mjs >> 052 multiline notes retain literal text filters and archived read-only behavior
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-017-draft/suite/notes.spec.mjs:10:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').visible()
Expected: 1
Received: 2
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').visible() with timeout 5000ms
  - waiting for getByTestId('task-row').visible()
    14 × locator resolved to 2 elements
       - unexpected value "2"

```

# Page snapshot

```yaml
- generic [active] [ref=f7e1]:
  - heading "task-017 Notes values" [level=1] [ref=f7e2]
  - group [ref=f7e4]:
    - button "Download project" [ref=f7e5]
  - group [ref=f7e7]:
    - button "Projects" [ref=f7e8]
  - group [ref=f7e10]:
    - generic [ref=f7e11]:
      - text: Task search
      - textbox "Task search" [ref=f7e12]: Only in notes
    - button "Search tasks" [ref=f7e13]
  - group [ref=f7e15]:
    - generic [ref=f7e16]:
      - text: Due from
      - textbox "Due from" [ref=f7e17]
    - generic [ref=f7e18]:
      - text: Due through
      - textbox "Due through" [ref=f7e19]
    - button "Apply due range" [ref=f7e20]
  - group [ref=f7e22]:
    - generic [ref=f7e23]:
      - text: New project name
      - textbox "New project name" [ref=f7e24]
    - button "Rename project" [ref=f7e25]
  - generic [ref=f7e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f7e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f7e30]:
    - generic [ref=f7e31]:
      - text: Task title
      - textbox "Task title" [ref=f7e32]
    - button "Create task" [ref=f7e33]
  - generic [ref=f7e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f7e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f7e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f7e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f7e40]:
    - text: Notes identity
    - group [ref=f7e42]:
      - button "Delete task" [ref=f7e43]
    - checkbox "Complete Notes identity" [ref=f7e45]
    - group [ref=f7e47]:
      - generic [ref=f7e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f7e49]: First line Ω Only in notes </textarea><script>window.ffNotesExecuted=true</script><textarea> last line
      - button "Save notes" [ref=f7e50]
    - group [ref=f7e52]:
      - generic [ref=f7e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f7e54]
      - button "Save due date" [ref=f7e55]
    - group [ref=f7e57]:
      - generic [ref=f7e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f7e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f7e60]
    - group [ref=f7e62]:
      - generic [ref=f7e63]:
        - text: New task title
        - textbox "New task title" [ref=f7e64]
      - button "Rename task" [ref=f7e65]
    - generic [ref=f7e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f7e68]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f7e69]:
    - text: Only in notes title sentinel
    - group [ref=f7e71]:
      - button "Delete task" [ref=f7e72]
    - checkbox "Complete Only in notes title sentinel" [ref=f7e74]
    - group [ref=f7e76]:
      - generic [ref=f7e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f7e78]
      - button "Save notes" [ref=f7e79]
    - group [ref=f7e81]:
      - generic [ref=f7e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f7e83]
      - button "Save due date" [ref=f7e84]
    - group [ref=f7e86]:
      - generic [ref=f7e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f7e88]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f7e89]
    - group [ref=f7e91]:
      - generic [ref=f7e92]:
        - text: New task title
        - textbox "New task title" [ref=f7e93]
      - button "Rename task" [ref=f7e94]
    - generic [ref=f7e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f7e97]:
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
  6  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return notes(observer,title).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}
  7  | }
  8  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  9  | if(stage>=15){
  10 |  test('052 multiline notes retain literal text filters and archived read-only behavior',async({page})=>{
  11 |   await createProject(page,'Notes values');await openProject(page,'Notes values');await createTask(page,'Notes identity');await expect(notes(page,'Notes identity')).toHaveValue('');await createTask(page,'Only in notes title sentinel');
  12 |   const value='  First line Ω\n  Only in notes\n</textarea><script>window.ffNotesExecuted=true</script><textarea>\nlast line  ';
  13 |   await saveNotes(page,'Notes values','Notes identity',value);await page.reload();await expect(notes(page,'Notes identity')).toHaveValue(value);expect(await page.evaluate(()=>window.ffNotesExecuted)).not.toBe(true);
> 14 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('Only in notes');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Only in notes title sentinel')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Notes identity')).toHaveCount(0);await page.getByRole('textbox',{name:'Task search',exact:true}).fill('identity');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Notes identity')).toBeVisible();
     |                                                                                                                                                                                                                                                                                                            ^ Error: expect(locator).toHaveCount(expected) failed
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