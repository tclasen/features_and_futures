# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-deletion-position.spec.mjs >> 080 bulk directory deletion preserves own and foreign reserved positions later edits and export order
- Location: experiments/instruction-effects/revisions/research-v006/decisions/task-024-position-draft/suite/directory-deletion-position.spec.mjs:8:14

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: page.waitForEvent: Test timeout of 90000ms exceeded.
=========================== logs ===========================
waiting for event "download"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f53e1]:
  - heading "task-024 Bulk position first" [level=1] [ref=f53e2]
  - group [ref=f53e4]:
    - button "Download project" [ref=f53e5]
  - group [ref=f53e7]:
    - button "Projects" [ref=f53e8]
  - group [ref=f53e10]:
    - generic [ref=f53e11]:
      - text: Task search
      - textbox "Task search" [ref=f53e12]
    - button "Search tasks" [ref=f53e13]
  - group [ref=f53e15]:
    - generic [ref=f53e16]:
      - text: Due from
      - textbox "Due from" [ref=f53e17]
    - generic [ref=f53e18]:
      - text: Due through
      - textbox "Due through" [ref=f53e19]
    - button "Apply due range" [ref=f53e20]
  - group [ref=f53e22]:
    - generic [ref=f53e23]:
      - text: New project name
      - textbox "New project name" [ref=f53e24]
    - button "Rename project" [ref=f53e25]
  - generic [ref=f53e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f53e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f53e30]:
    - generic [ref=f53e31]:
      - text: Task title
      - textbox "Task title" [ref=f53e32]
    - button "Create task" [ref=f53e33]
  - generic [ref=f53e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f53e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f53e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f53e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f53e40]:
    - text: Bulk before A
    - group [ref=f53e42]:
      - button "Delete task" [ref=f53e43]
    - checkbox "Complete Bulk before A" [ref=f53e45]
    - group [ref=f53e47]:
      - generic [ref=f53e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f53e49]
      - button "Save notes" [ref=f53e50]
    - group [ref=f53e52]:
      - generic [ref=f53e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f53e54]
      - button "Save due date" [ref=f53e55]
    - group [ref=f53e57]:
      - generic [ref=f53e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f53e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-024 Bulk position second"
      - button "Move task" [ref=f53e60]
    - group [ref=f53e62]:
      - generic [ref=f53e63]:
        - text: New task title
        - textbox "New task title" [ref=f53e64]
      - button "Rename task" [ref=f53e65]
    - generic [ref=f53e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f53e68]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f53e69]:
    - text: task-024 Bulk position travelling
    - group [ref=f53e71]:
      - button "Delete task" [ref=f53e72]
    - checkbox "Complete task-024 Bulk position travelling" [checked] [ref=f53e74]
    - group [ref=f53e76]:
      - generic [ref=f53e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f53e78]: After deletion Ω new literal notes
      - button "Save notes" [ref=f53e79]
    - group [ref=f53e81]:
      - generic [ref=f53e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f53e83]: 2068-02-29
      - button "Save due date" [ref=f53e84]
    - group [ref=f53e86]:
      - generic [ref=f53e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f53e88]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-024 Bulk position second"
      - button "Move task" [ref=f53e89]
    - group [ref=f53e91]:
      - generic [ref=f53e92]:
        - text: New task title
        - textbox "New task title" [ref=f53e93]
      - button "Rename task" [ref=f53e94]
    - generic [ref=f53e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f53e97]:
        - option "Low" [selected]
        - option "Normal"
        - option "High"
  - generic [ref=f53e98]:
    - text: Bulk after A
    - group [ref=f53e100]:
      - button "Delete task" [ref=f53e101]
    - checkbox "Complete Bulk after A" [ref=f53e103]
    - group [ref=f53e105]:
      - generic [ref=f53e106]:
        - text: Task notes
        - textbox "Task notes" [ref=f53e107]
      - button "Save notes" [ref=f53e108]
    - group [ref=f53e110]:
      - generic [ref=f53e111]:
        - text: Task due date
        - textbox "Task due date" [ref=f53e112]
      - button "Save due date" [ref=f53e113]
    - group [ref=f53e115]:
      - generic [ref=f53e116]:
        - text: Destination project
        - combobox "Destination project" [ref=f53e117]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-024 Bulk position second"
      - button "Move task" [ref=f53e118]
    - group [ref=f53e120]:
      - generic [ref=f53e121]:
        - text: New task title
        - textbox "New task title" [ref=f53e122]
      - button "Rename task" [ref=f53e123]
    - generic [ref=f53e125]:
      - text: Task priority
      - combobox "Task priority" [ref=f53e126]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | async function home(p,owner){await p.goto('/');await openProject(p,owner);}
  4  | async function order(p,titles){const rows=p.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(titles.length);for(const [i,title] of titles.entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  5  | async function save(p,owner,title,label,value){await taskRow(p,title).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(p,title).getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const o=await p.context().newPage();try{await expect.poll(async()=>{await home(o,owner);return taskRow(o,title).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await o.close();}await home(p,owner);}
  6  | async function move(p,source,target,title,sourceOrder,targetOrder){await taskRow(p,title).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(p,title).getByRole('button',{name:'Move task',exact:true}).click();const o=await p.context().newPage();try{await home(o,target);await order(o,targetOrder);await home(o,source);await order(o,sourceOrder);}finally{await o.close();}await home(p,target);}
  7  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  8  | if(stage>=24)test('080 bulk directory deletion preserves own and foreign reserved positions later edits and export order',async({page})=>{
  9  |  test.setTimeout(90000);const a='Bulk position first',b='Bulk position second',beforeA='Bulk before A',afterA='Bulk after A',beforeB='Bulk before B',afterB='Bulk later B',travel=projectName('Bulk position travelling');
  10 |  await createProject(page,a);await openProject(page,a);await createTask(page,beforeA);await createTask(page,travel);await createTask(page,afterA);await taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,a,travel,'High');await home(page,a);await save(page,a,travel,'Task due date','2064-02-29');await save(page,a,travel,'Task notes','Before deletion Ω\nretained');
  11 |  await createProject(page,b);await openProject(page,b);await createTask(page,beforeB);await home(page,a);await move(page,a,b,travel,[beforeA,afterA],[beforeB,travel]);await move(page,b,a,travel,[beforeB],[beforeA,travel,afterA]);await home(page,b);await createTask(page,afterB);
  12 |  await page.goto('/');await page.getByRole('button',{name:'Task directory',exact:true}).click();await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(travel);await page.getByRole('button',{name:'Search directory',exact:true}).click();const rows=page.getByTestId('directory-task-row').filter({visible:true});await expect(rows.getByTestId('directory-task-title')).toHaveText([travel]);await page.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await expect(page.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(rows).toHaveCount(0);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(rows.getByTestId('directory-task-title')).toHaveText([travel]);await page.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await expect(page.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(rows).toHaveCount(0);
  13 |  await home(page,a);await order(page,[beforeA,travel,afterA]);await move(page,a,b,travel,[beforeA,afterA],[beforeB,travel,afterB]);await taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'Low'});await expectPersistedPriority(page,b,travel,'Low');await home(page,b);await page.getByRole('checkbox',{name:'Complete '+travel,exact:true}).check();await expectPersistedCompletion(page,b,travel,true);await home(page,b);await save(page,b,travel,'Task due date','2068-02-29');await save(page,b,travel,'Task notes','After deletion Ω\nnew literal notes');await move(page,b,a,travel,[beforeB,afterB],[beforeA,travel,afterA]);
  14 |  await expect(taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Low');await expect(page.getByRole('checkbox',{name:'Complete '+travel,exact:true})).toBeChecked();await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2068-02-29');await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('After deletion Ω\nnew literal notes');
> 15 |  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();const download=await pending;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const doc=JSON.parse(Buffer.concat(chunks).toString('utf8'));expect(doc.project.tasks.map(t=>t.title)).toEqual([beforeA,travel,afterA]);expect(doc.project.tasks[1]).toMatchObject({title:travel,completed:true,priority:'Low',dueDate:'2068-02-29',notes:'After deletion Ω\nnew literal notes',deleted:false});await page.goto('/');await expect(projectRow(page,a).getByTestId('project-summary')).toHaveText('1/3 completed');await expect(projectRow(page,b).getByTestId('project-summary')).toHaveText('0/2 completed');
     |                     ^ Error: page.waitForEvent: Test timeout of 90000ms exceeded.
  16 | });
  17 | 
```