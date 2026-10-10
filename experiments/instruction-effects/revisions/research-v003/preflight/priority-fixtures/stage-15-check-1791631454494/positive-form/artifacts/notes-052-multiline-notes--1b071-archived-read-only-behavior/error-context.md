# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notes.spec.mjs >> 052 multiline notes retain literal text filters and archived read-only behavior
- Location: experiments/instruction-effects/revisions/research-v003/decisions/task-015-draft/suite/notes.spec.mjs:10:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-015 Notes values' }).visible().getByRole('button', { name: 'Restore project', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f19e1]:
  - heading "Workboard" [level=1] [ref=f19e2]
  - group [ref=f19e4]:
    - generic [ref=f19e5]:
      - text: Project name
      - textbox "Project name" [ref=f19e6]
    - button "Create project" [ref=f19e7]
  - group [ref=f19e9]:
    - generic [ref=f19e10]:
      - text: Project search
      - textbox "Project search" [ref=f19e11]
    - button "Search projects" [ref=f19e12]
  - generic [ref=f19e14]:
    - text: Project filter
    - combobox "Project filter" [ref=f19e15]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f19e16]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f19e18]:
      - button "Open project" [ref=f19e19]
    - group [ref=f19e21]:
      - button "Archive project" [ref=f19e22]
  - generic [ref=f19e23]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f19e25]:
      - button "Open project" [ref=f19e26]
    - group [ref=f19e28]:
      - button "Archive project" [ref=f19e29]
  - generic [ref=f19e30]:
    - text: task-015 Defaults independent0/1 completed
    - group [ref=f19e32]:
      - button "Open project" [ref=f19e33]
    - group [ref=f19e35]:
      - button "Archive project" [ref=f19e36]
  - generic [ref=f19e37]:
    - text: task-015 Defaults inheritance1/4 completed
    - group [ref=f19e39]:
      - button "Open project" [ref=f19e40]
    - group [ref=f19e42]:
      - button "Archive project" [ref=f19e43]
  - generic [ref=f19e44]:
    - text: task-015 Defaults renamed0/2 completed
    - group [ref=f19e46]:
      - button "Open project" [ref=f19e47]
    - group [ref=f19e49]:
      - button "Archive project" [ref=f19e50]
  - generic [ref=f19e51]:
    - text: task-015 Calendar persistence0/1 completed
    - group [ref=f19e53]:
      - button "Open project" [ref=f19e54]
    - group [ref=f19e56]:
      - button "Archive project" [ref=f19e57]
  - generic [ref=f19e58]:
    - text: task-015 Calendar validation0/1 completed
    - group [ref=f19e60]:
      - button "Open project" [ref=f19e61]
    - group [ref=f19e63]:
      - button "Archive project" [ref=f19e64]
  - generic [ref=f19e65]:
    - text: task-015 Calendar independence1/2 completed
    - group [ref=f19e67]:
      - button "Open project" [ref=f19e68]
    - group [ref=f19e70]:
      - button "Archive project" [ref=f19e71]
  - generic [ref=f19e72]:
    - text: task-015 Calendar second owner0/1 completed
    - group [ref=f19e74]:
      - button "Open project" [ref=f19e75]
    - group [ref=f19e77]:
      - button "Archive project" [ref=f19e78]
  - generic [ref=f19e79]:
    - text: task-015 Calendar archival0/1 completed
    - group [ref=f19e81]:
      - button "Open project" [ref=f19e82]
    - group [ref=f19e84]:
      - button "Archive project" [ref=f19e85]
  - generic [ref=f19e86]:
    - text: task-015 Range boundaries0/5 completed
    - group [ref=f19e88]:
      - button "Open project" [ref=f19e89]
    - group [ref=f19e91]:
      - button "Archive project" [ref=f19e92]
  - generic [ref=f19e93]:
    - text: task-015 Range intersections0/4 completed
    - group [ref=f19e95]:
      - button "Open project" [ref=f19e96]
    - group [ref=f19e98]:
      - button "Archive project" [ref=f19e99]
  - generic [ref=f19e100]:
    - text: task-015 Range validation0/2 completed
    - group [ref=f19e102]:
      - button "Open project" [ref=f19e103]
    - group [ref=f19e105]:
      - button "Archive project" [ref=f19e106]
  - generic [ref=f19e107]:
    - text: task-015 Range archival0/2 completed
    - group [ref=f19e109]:
      - button "Open project" [ref=f19e110]
    - group [ref=f19e112]:
      - button "Archive project" [ref=f19e113]
  - generic [ref=f19e114]:
    - text: task-015 Range owner renamed0/3 completed
    - group [ref=f19e116]:
      - button "Open project" [ref=f19e117]
    - group [ref=f19e119]:
      - button "Archive project" [ref=f19e120]
  - generic [ref=f19e121]:
    - text: task-015 Transfer target1/3 completed
    - group [ref=f19e123]:
      - button "Open project" [ref=f19e124]
    - group [ref=f19e126]:
      - button "Archive project" [ref=f19e127]
  - generic [ref=f19e128]:
    - text: task-015 Transfer source0/1 completed
    - group [ref=f19e130]:
      - button "Open project" [ref=f19e131]
    - group [ref=f19e133]:
      - button "Archive project" [ref=f19e134]
  - generic [ref=f19e135]:
    - text: task-015 Filtered transfer target0/1 completed
    - group [ref=f19e137]:
      - button "Open project" [ref=f19e138]
    - group [ref=f19e140]:
      - button "Archive project" [ref=f19e141]
  - generic [ref=f19e142]:
    - text: task-015 Filtered transfer source0/2 completed
    - group [ref=f19e144]:
      - button "Open project" [ref=f19e145]
    - group [ref=f19e147]:
      - button "Archive project" [ref=f19e148]
  - generic [ref=f19e149]:
    - text: task-015 Options first0/0 completed
    - group [ref=f19e151]:
      - button "Open project" [ref=f19e152]
    - group [ref=f19e154]:
      - button "Archive project" [ref=f19e155]
  - generic [ref=f19e156]:
    - text: task-015 Options second0/0 completed
    - group [ref=f19e158]:
      - button "Open project" [ref=f19e159]
    - group [ref=f19e161]:
      - button "Archive project" [ref=f19e162]
  - generic [ref=f19e163]:
    - text: task-015 Options owner0/1 completed
    - group [ref=f19e165]:
      - button "Open project" [ref=f19e166]
    - group [ref=f19e168]:
      - button "Archive project" [ref=f19e169]
  - generic [ref=f19e170]:
    - text: task-015 Read-only transfer target0/0 completed
    - group [ref=f19e172]:
      - button "Open project" [ref=f19e173]
    - group [ref=f19e175]:
      - button "Archive project" [ref=f19e176]
  - generic [ref=f19e177]:
    - text: task-015 Read-only transfer owner0/1 completed
    - group [ref=f19e179]:
      - button "Open project" [ref=f19e180]
    - group [ref=f19e182]:
      - button "Archive project" [ref=f19e183]
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
  11 |   await createProject(page,'Notes values');await openProject(page,'Notes values');await createTask(page,'Notes identity');await expect(notes(page,'Notes identity')).toHaveValue('');
  12 |   const value='  First line Ω\n  Only in notes\n</textarea><script>window.ffNotesExecuted=true</script><textarea>\nlast line  ';
  13 |   await saveNotes(page,'Notes values','Notes identity',value);await page.reload();await expect(notes(page,'Notes identity')).toHaveValue(value);expect(await page.evaluate(()=>window.ffNotesExecuted)).not.toBe(true);
  14 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('Only in notes');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);await page.getByRole('textbox',{name:'Task search',exact:true}).fill('identity');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Notes identity')).toBeVisible();
  15 |   await taskRow(page,'Notes identity').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Notes values','Notes identity','High');await taskRow(page,'Notes identity').getByRole('textbox',{name:'Task due date',exact:true}).fill('2035-01-01');await taskRow(page,'Notes identity').getByRole('button',{name:'Save due date',exact:true}).click();const dateObserver=await page.context().newPage();try{await expect.poll(async()=>{await dateObserver.goto('/');await openProject(dateObserver,'Notes values');return taskRow(dateObserver,'Notes identity').getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2035-01-01');}finally{await dateObserver.close();}
  16 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2035-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2035-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await saveNotes(page,'Notes values','Notes identity','');
  17 |   await expect(notes(page,'Notes identity')).toHaveValue('');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('identity');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2035-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2035-01-01');
  18 |   await saveNotes(page,'Notes values','Notes identity',value);await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Notes values').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Notes values')).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Notes values');await expect(notes(page,'Notes identity')).toHaveValue(value);await expect(notes(page,'Notes identity')).toBeDisabled();await expect(taskRow(page,'Notes identity').getByRole('button',{name:'Save notes',exact:true})).toBeDisabled();
> 19 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Notes values').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Notes values');await expect(notes(page,'Notes identity')).toHaveValue(value);await expect(notes(page,'Notes identity')).toBeEnabled();await expect(taskRow(page,'Notes identity').getByRole('button',{name:'Save notes',exact:true})).toBeEnabled();
     |                                                                                                                                                                     ^ Error: locator.click: Test timeout of 20000ms exceeded.
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