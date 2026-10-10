# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: return-order.spec.mjs >> 044 rename archival and restoration preserve returning project identity
- Location: experiments/instruction-effects/revisions/research-v003/decisions/task-014-draft/suite/return-order.spec.mjs:20:2

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: "task-014 Returned owner renamed"
Received array: []
```

# Page snapshot

```yaml
- generic [active] [ref=f17e1]:
  - heading "task-014 Return identity holding" [level=1] [ref=f17e2]
  - group [ref=f17e4]:
    - button "Projects" [ref=f17e5]
  - group [ref=f17e7]:
    - generic [ref=f17e8]:
      - text: Task search
      - textbox "Task search" [ref=f17e9]
    - button "Search tasks" [ref=f17e10]
  - group [ref=f17e12]:
    - generic [ref=f17e13]:
      - text: Due from
      - textbox "Due from" [ref=f17e14]
    - generic [ref=f17e15]:
      - text: Due through
      - textbox "Due through" [ref=f17e16]
    - button "Apply due range" [ref=f17e17]
  - group [ref=f17e19]:
    - generic [ref=f17e20]:
      - text: New project name
      - textbox "New project name" [ref=f17e21]
    - button "Rename project" [ref=f17e22]
  - generic [ref=f17e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f17e25]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f17e27]:
    - generic [ref=f17e28]:
      - text: Task title
      - textbox "Task title" [ref=f17e29]
    - button "Create task" [ref=f17e30]
  - generic [ref=f17e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f17e33]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f17e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f17e36]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f17e37]:
    - text: Identity returning
    - checkbox "Complete Identity returning" [ref=f17e39]
    - group [ref=f17e41]:
      - generic [ref=f17e42]:
        - text: Task due date
        - textbox "Task due date" [ref=f17e43]
      - button "Save due date" [ref=f17e44]
    - group [ref=f17e46]:
      - generic [ref=f17e47]:
        - text: Destination project
        - combobox "Destination project" [ref=f17e48]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-014 Defaults independent"
          - option "task-014 Defaults inheritance"
          - option "task-014 Defaults renamed"
          - option "task-014 Calendar persistence"
          - option "task-014 Calendar validation"
          - option "task-014 Calendar independence"
          - option "task-014 Calendar second owner"
          - option "task-014 Calendar archival"
          - option "task-014 Range boundaries"
          - option "task-014 Range intersections"
          - option "task-014 Range validation"
          - option "task-014 Range archival"
          - option "task-014 Range owner renamed"
          - option "task-014 Transfer target"
          - option "task-014 Transfer source"
          - option "task-014 Filtered transfer target"
          - option "task-014 Filtered transfer source"
          - option "task-014 Options first"
          - option "task-014 Options second"
          - option "task-014 Options owner"
          - option "task-014 Read-only transfer target"
          - option "task-014 Read-only transfer owner"
          - option "task-014 Priority intersection"
          - option "task-014 Priority live filters"
          - option "task-014 Priority rename filters"
          - option "task-014 Archived combined filters"
          - option "task-014 Priority ownership"
          - option "task-014 Priority other owner"
          - option "task-014 Priority completion"
          - option "task-014 Priority archive"
          - option "task-014 Return holding"
          - option "task-014 Return owner"
          - option "task-014 Returned owner renamed"
      - button "Move task" [ref=f17e49]
    - group [ref=f17e51]:
      - generic [ref=f17e52]:
        - text: New task title
        - textbox "New task title" [ref=f17e53]
      - button "Rename task" [ref=f17e54]
    - generic [ref=f17e56]:
      - text: Task priority
      - combobox "Task priority" [ref=f17e57]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3  | async function moveTask(page,source,target,title){
  4  |  const completed=await taskRow(page,title).getByRole('checkbox',{name:'Complete '+title,exact:true}).isChecked();
  5  |  const baseline=await page.context().newPage();let sourceSummary;
  6  |  try{await baseline.goto('/');const summary=projectRow(baseline,source).getByTestId('project-summary');await expect(summary).toHaveText(/^\d+\/\d+ completed$/);const [done,total]=(await summary.innerText()).match(/\d+/g).map(Number);sourceSummary=`${done-Number(completed)}/${total-1} completed`;}finally{await baseline.close();}
  7  |  await taskRow(page,title).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,title).getByRole('button',{name:'Move task',exact:true}).click();
  8  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,target);await expect(taskRow(observer,title)).toBeVisible();let count=await taskRow(observer,title).count();await observer.goto('/');await expect(projectRow(observer,source).getByTestId('project-summary')).toHaveText(sourceSummary);await openProject(observer,source);return [count,await taskRow(observer,title).count()];},{timeout:5000}).toEqual([1,0]);}finally{await observer.close();}
  9  | }
  10 | async function order(page,titles){const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(titles.length);for(const [i,title] of titles.entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  11 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  12 | if(stage>=12){
  13 |  test('043 returning tasks in reverse order restores prior positions and current fields',async({page})=>{
  14 |   await createProject(page,'Return holding');await createProject(page,'Return owner');await openProject(page,'Return owner');
  15 |   for(const title of ['Return first','Return second','Return third','Return fourth'])await createTask(page,title);
  16 |   await moveTask(page,'Return owner','Return holding','Return second');await moveTask(page,'Return owner','Return holding','Return third');await order(page,['Return first','Return fourth']);await page.goto('/');await openProject(page,'Return holding');
  17 |   await taskRow(page,'Return second').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Return holding','Return second','High');await page.getByRole('checkbox',{name:'Complete Return second',exact:true}).check();await expectPersistedCompletion(page,'Return holding','Return second',true);
  18 |   await moveTask(page,'Return holding','Return owner','Return third');await moveTask(page,'Return holding','Return owner','Return second');await page.goto('/');await openProject(page,'Return owner');await order(page,['Return first','Return second','Return third','Return fourth']);await expect(taskRow(page,'Return second').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('checkbox',{name:'Complete Return second',exact:true})).toBeChecked();await page.reload();await order(page,['Return first','Return second','Return third','Return fourth']);
  19 |  });
  20 |  test('044 rename archival and restoration preserve returning project identity',async({page})=>{
  21 |   await createProject(page,'Return identity holding');await createProject(page,'Return identity owner');await openProject(page,'Return identity owner');for(const title of ['Identity before','Identity returning','Identity after'])await createTask(page,title);await moveTask(page,'Return identity owner','Return identity holding','Identity returning');
  22 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Returned owner renamed'));await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName('Returned owner renamed'),exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Returned owner renamed').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Returned owner renamed')).toHaveCount(0);await openProject(page,'Return identity holding');
  23 |   const choices=()=>taskRow(page,'Identity returning').getByRole('combobox',{name:'Destination project',exact:true}).locator('option');await expect(taskRow(page,'Identity returning')).toBeVisible();await expect(choices()).not.toContainText([projectName('Returned owner renamed')]);
> 24 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Returned owner renamed').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Return identity holding');expect(await choices().allTextContents()).toContain(projectName('Returned owner renamed'));expect(await choices().allTextContents()).not.toContain(projectName('Return identity owner'));
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           ^ Error: expect(received).toContain(expected) // indexOf
  25 |   await moveTask(page,'Return identity holding','Returned owner renamed','Identity returning');await page.goto('/');await openProject(page,'Returned owner renamed');await order(page,['Identity before','Identity returning','Identity after']);
  26 |  });
  27 |  test('045 return positions belong to each project and precede later new arrivals',async({page})=>{
  28 |   await createProject(page,'Position second owner');await openProject(page,'Position second owner');await createTask(page,'Second existing');await createProject(page,'Position third owner');await createProject(page,'Position first owner');await openProject(page,'Position first owner');for(const title of ['First existing','Position travelling','First later'])await createTask(page,title);
  29 |   await moveTask(page,'Position first owner','Position second owner','Position travelling');await createTask(page,'First newly created');await page.goto('/');await openProject(page,'Position second owner');await order(page,['Second existing','Position travelling']);await moveTask(page,'Position second owner','Position third owner','Position travelling');await createTask(page,'Second newly created');await page.goto('/');await openProject(page,'Position third owner');await moveTask(page,'Position third owner','Position second owner','Position travelling');await page.goto('/');await openProject(page,'Position second owner');await order(page,['Second existing','Position travelling','Second newly created']);
  30 |   await moveTask(page,'Position second owner','Position first owner','Position travelling');await page.goto('/');await openProject(page,'Position first owner');await order(page,['First existing','Position travelling','First later','First newly created']);
  31 |  });
  32 | }
  33 | 
```