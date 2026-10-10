# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: default-priority.spec.mjs >> 028 project default affects only future tasks and retains filters and summary
- Location: runs/instruction-effects/eval-002/decisions/task-009-draft/suite/default-priority.spec.mjs:20:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByRole('combobox', { name: 'Task filter', exact: true }).locator('option:checked')
Expected: "Open"
Received: "All"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByRole('combobox', { name: 'Task filter', exact: true }).locator('option:checked') with timeout 5000ms
  - waiting for getByRole('combobox', { name: 'Task filter', exact: true }).locator('option:checked')
    14 × locator resolved to <option selected>All</option>
       - unexpected value "All"

```

```yaml
- heading "task-009 Defaults inheritance" [level=1]
- group:
  - button "Projects"
- group:
  - text: New project name
  - textbox "New project name"
  - button "Rename project"
- text: Default task priority
- combobox "Default task priority":
  - option "Low" [selected]
  - option "Normal"
  - option "High"
- group:
  - text: Task title
  - textbox "Task title"
  - button "Create task"
- text: Task filter
- combobox "Task filter":
  - option "All" [selected]
  - option "Open"
  - option "Completed"
- text: Priority filter
- combobox "Priority filter":
  - option "All" [selected]
  - option "Low"
  - option "Normal"
  - option "High"
- text: Before default change
- checkbox "Complete Before default change" [checked]
- group:
  - text: Task due date
  - textbox "Task due date"
  - button "Save due date"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal" [selected]
  - option "High"
- text: Inherited high
- checkbox "Complete Inherited high"
- group:
  - text: Task due date
  - textbox "Task due date"
  - button "Save due date"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal"
  - option "High" [selected]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3  | const defaults=page=>page.getByRole('combobox',{name:'Default task priority',exact:true});
  4  | const priority=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true});
  5  | export async function persistedDefault(page,project,value) {
  6  |  const observer=await page.context().newPage();
  7  |  try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return defaults(observer).locator('option:checked').textContent();},{timeout:5000}).toBe(value);} finally {await observer.close();}
  8  | }
  9  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  10 | if(stage>=8) {
  11 |  test('027 pre-default projects and tasks preserve their distinct saved priorities',async({page})=>{
  12 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  13 |   const prior=page.getByTestId('project-row').filter({hasText:'task-007 Persistence renamed'}).filter({visible:true});
  14 |   await expect(prior.getByTestId('project-summary')).toHaveText('1/1 completed');
  15 |   await prior.getByRole('button',{name:'Open project',exact:true}).click();
  16 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');await expect(defaults(page)).toBeDisabled();
  17 |   await expect(priority(page,'Memory kept').locator('option:checked')).toHaveText('High');
  18 |   await expect(page.getByRole('checkbox',{name:'Complete Memory kept',exact:true})).toBeChecked();
  19 |  });
  20 |  test('028 project default affects only future tasks and retains filters and summary',async({page})=>{
  21 |   await createProject(page,'Defaults independent');
  22 |   await createProject(page,'Defaults inheritance');await openProject(page,'Defaults inheritance');
  23 |   await expect(defaults(page).locator('option')).toHaveText(['Low','Normal','High']);
  24 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');
  25 |   await createTask(page,'Before default change');
  26 |   await page.getByRole('checkbox',{name:'Complete Before default change',exact:true}).check();
  27 |   await expectPersistedCompletion(page,'Defaults inheritance','Before default change',true);
  28 |   await defaults(page).selectOption({label:'High'});await persistedDefault(page,'Defaults inheritance','High');
  29 |   await createTask(page,'Inherited high');await expectPersistedPriority(page,'Defaults inheritance','Inherited high','High');
  30 |   await expect(priority(page,'Before default change').locator('option:checked')).toHaveText('Normal');
  31 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});
  32 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});
  33 |   await defaults(page).selectOption({label:'Low'});await persistedDefault(page,'Defaults inheritance','Low');
  34 |   await persistedDefault(page,'Defaults independent','Normal');
> 35 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');
     |                                                                                                      ^ Error: expect(locator).toHaveText(expected) failed
  36 |   await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  37 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  38 |   await expect(priority(page,'Inherited high').locator('option:checked')).toHaveText('High');
  39 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});
  40 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});
  41 |   await createTask(page,'Inherited low');await expectPersistedPriority(page,'Defaults inheritance','Inherited low','Low');
  42 |   await defaults(page).selectOption({label:'Normal'});await persistedDefault(page,'Defaults inheritance','Normal');
  43 |   await createTask(page,'Inherited normal');await expectPersistedPriority(page,'Defaults inheritance','Inherited normal','Normal');
  44 |   await expect(priority(page,'Inherited high').locator('option:checked')).toHaveText('High');
  45 |   await expect(priority(page,'Inherited low').locator('option:checked')).toHaveText('Low');
  46 |   const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
  47 |   for(const [i,title] of ['Before default change','Inherited high','Inherited low','Inherited normal'].entries())expect(rows[i]).toContain(title);
  48 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Defaults inheritance').getByTestId('project-summary')).toHaveText('1/4 completed');
  49 |   await page.goto('/');await openProject(page,'Defaults independent');
  50 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');await createTask(page,'Independent normal');
  51 |   await expect(priority(page,'Independent normal').locator('option:checked')).toHaveText('Normal');
  52 |  });
  53 |  test('029 project default survives rename archive and restoration',async({page})=>{
  54 |   await createProject(page,'Defaults lifecycle');await openProject(page,'Defaults lifecycle');
  55 |   await defaults(page).selectOption({label:'Low'});await persistedDefault(page,'Defaults lifecycle','Low');
  56 |   await createTask(page,'Lifecycle task');await expectPersistedPriority(page,'Defaults lifecycle','Lifecycle task','Low');
  57 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Defaults renamed'));
  58 |   await page.getByRole('button',{name:'Rename project',exact:true}).click();
  59 |   await expect(page.getByRole('heading',{name:projectName('Defaults renamed'),exact:true}).first()).toBeVisible();
  60 |   await persistedDefault(page,'Defaults renamed','Low');await page.reload();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  61 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Defaults renamed').getByRole('button',{name:'Archive project',exact:true}).click();
  62 |   await expect(projectRow(page,'Defaults renamed')).toHaveCount(0);
  63 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Defaults renamed');
  64 |   await expect(defaults(page)).toBeDisabled();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  65 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  66 |   await projectRow(page,'Defaults renamed').getByRole('button',{name:'Restore project',exact:true}).click();
  67 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Defaults renamed');
  68 |   await expect(defaults(page)).toBeEnabled();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  69 |   await expect(priority(page,'Lifecycle task').locator('option:checked')).toHaveText('Low');
  70 |   await createTask(page,'Restored inherits');await expectPersistedPriority(page,'Defaults renamed','Restored inherits','Low');
  71 |  });
  72 | }
  73 | 
```