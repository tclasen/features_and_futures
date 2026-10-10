# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority-filter.spec.mjs >> 025 task rename retains combined filter membership
- Location: runs/instruction-effects/eval-007/tasks/task-007/suite/priority-filter.spec.mjs:73:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByRole('combobox', { name: 'Priority filter', exact: true }).locator('option:checked')
Expected: "Low"
Received: "All"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByRole('combobox', { name: 'Priority filter', exact: true }).locator('option:checked') with timeout 5000ms
  - waiting for getByRole('combobox', { name: 'Priority filter', exact: true }).locator('option:checked')
    14 × locator resolved to <option selected>All</option>
       - unexpected value "All"

```

```yaml
- main:
  - button "Projects"
  - heading "task-007 Priority rename filters" [level=1]
  - text: New project name
  - textbox "New project name"
  - button "Rename project"
  - text: Task title
  - textbox "Task title"
  - button "Create task"
  - text: Task filter
  - combobox "Task filter":
    - option "All"
    - option "Open" [selected]
    - option "Completed"
  - text: Priority filter
  - combobox "Priority filter":
    - option "All" [selected]
    - option "Low"
    - option "Normal"
    - option "High"
  - region "Tasks":
    - text: Filtered new title
    - checkbox "Complete Filtered new title"
    - combobox "Task priority":
      - option "Low" [selected]
      - option "Normal"
      - option "High"
    - text: New task title
    - textbox "New task title"
    - button "Rename task"
    - text: Unmatched normal task
    - checkbox "Complete Unmatched normal task"
    - combobox "Task priority":
      - option "Low"
      - option "Normal" [selected]
      - option "High"
    - text: New task title
    - textbox "New task title"
    - button "Rename task"
```

# Test source

```ts
  1   | import {test,expect} from '@playwright/test';
  2   | import {stage,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3   | const completion=page=>page.getByRole('combobox',{name:'Task filter',exact:true});
  4   | const filter=page=>page.getByRole('combobox',{name:'Priority filter',exact:true});
  5   | const priority=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true});
  6   | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  7   | if(stage>=7) {
  8   |   test('023 priority and completion filters intersect in creation order',async({page})=>{
  9   |     await createProject(page,'Priority intersection');await openProject(page,'Priority intersection');
  10  |     await expect(filter(page).locator('option')).toHaveText(['All','Low','Normal','High']);
  11  |     await expect(filter(page).locator('option:checked')).toHaveText('All');
  12  |     for(const title of ['High open first','Low open','High completed','High open last'])await createTask(page,title);
  13  |     for(const title of ['High open first','High completed','High open last']) {
  14  |       await priority(page,title).selectOption({label:'High'});
  15  |       await expectPersistedPriority(page,'Priority intersection',title,'High');
  16  |     }
  17  |     await priority(page,'Low open').selectOption({label:'Low'});
  18  |     await expectPersistedPriority(page,'Priority intersection','Low open','Low');
  19  |     await page.getByRole('checkbox',{name:'Complete High completed',exact:true}).check();
  20  |     await expectPersistedCompletion(page,'Priority intersection','High completed',true);
  21  |     await filter(page).selectOption({label:'High'});
  22  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);
  23  |     await completion(page).selectOption({label:'Open'});
  24  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  25  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  26  |     const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
  27  |     expect(rows[0]).toContain('High open first');expect(rows[1]).toContain('High open last');
  28  |     await completion(page).selectOption({label:'Completed'});
  29  |     await expect(taskRow(page,'High completed')).toBeVisible();
  30  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  31  |     await filter(page).selectOption({label:'Low'});
  32  |     await expect(completion(page).locator('option:checked')).toHaveText('Completed');
  33  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  34  |     await filter(page).selectOption({label:'All'});
  35  |     await expect(taskRow(page,'High completed')).toBeVisible();
  36  |     await completion(page).selectOption({label:'All'});
  37  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);
  38  |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  39  |     await expect(projectRow(page,'Priority intersection').getByTestId('project-summary')).toHaveText('1/4 completed');
  40  |   });
  41  | 
  42  |   test('024 filtered edits re-evaluate rows while retaining both filter choices',async({page})=>{
  43  |     await createProject(page,'Priority live filters');await openProject(page,'Priority live filters');
  44  |     await createTask(page,'Leaving priority');await createTask(page,'Leaving completion');
  45  |     for(const title of ['Leaving priority','Leaving completion']) {
  46  |       await priority(page,title).selectOption({label:'High'});
  47  |       await expectPersistedPriority(page,'Priority live filters',title,'High');
  48  |     }
  49  |     await createTask(page,'Completed high guard');await priority(page,'Completed high guard').selectOption({label:'High'});await expectPersistedPriority(page,'Priority live filters','Completed high guard','High');await page.getByRole('checkbox',{name:'Complete Completed high guard',exact:true}).check();await expectPersistedCompletion(page,'Priority live filters','Completed high guard',true);await createTask(page,'Open normal guard');
  50  |     await completion(page).selectOption({label:'Open'});await expect(taskRow(page,'Completed high guard')).toHaveCount(0);await expect(taskRow(page,'Open normal guard')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await filter(page).selectOption({label:'High'});await expect(taskRow(page,'Open normal guard')).toHaveCount(0);await expect(taskRow(page,'Leaving priority')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  51  |     await priority(page,'Leaving priority').selectOption({label:'Low'});
  52  |     await expectPersistedPriority(page,'Priority live filters','Leaving priority','Low');
  53  |     await expect(taskRow(page,'Leaving priority')).toHaveCount(0);
  54  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  55  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
  56  |     await page.getByRole('checkbox',{name:'Complete Leaving completion',exact:true}).check();
  57  |     await expectPersistedCompletion(page,'Priority live filters','Leaving completion',true);
  58  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  59  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  60  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
  61  |     await completion(page).selectOption({label:'Completed'});
  62  |     await expect(taskRow(page,'Leaving completion')).toBeVisible();
  63  |     await expect(priority(page,'Leaving completion').locator('option:checked')).toHaveText('High');
  64  |     await page.getByRole('checkbox',{name:'Complete Leaving completion',exact:true}).uncheck();
  65  |     await expectPersistedCompletion(page,'Priority live filters','Leaving completion',false);
  66  |     await expect(taskRow(page,'Leaving completion')).toHaveCount(0);
  67  |     await expect(completion(page).locator('option:checked')).toHaveText('Completed');
  68  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  69  |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  70  |     await expect(projectRow(page,'Priority live filters').getByTestId('project-summary')).toHaveText('1/4 completed');
  71  |   });
  72  | 
  73  |   test('025 task rename retains combined filter membership',async({page})=>{
  74  |     await createProject(page,'Priority rename filters');await openProject(page,'Priority rename filters');
  75  |     await createTask(page,'Filtered old title');await createTask(page,'Unmatched normal task');
  76  |     await priority(page,'Filtered old title').selectOption({label:'Low'});
  77  |     await expectPersistedPriority(page,'Priority rename filters','Filtered old title','Low');
  78  |     await createTask(page,'Completed low guard');await priority(page,'Completed low guard').selectOption({label:'Low'});await expectPersistedPriority(page,'Priority rename filters','Completed low guard','Low');await page.getByRole('checkbox',{name:'Complete Completed low guard',exact:true}).check();await expectPersistedCompletion(page,'Priority rename filters','Completed low guard',true);
  79  |     await filter(page).selectOption({label:'Low'});await expect(taskRow(page,'Unmatched normal task')).toHaveCount(0);await expect(taskRow(page,'Completed low guard')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await completion(page).selectOption({label:'Open'});await expect(taskRow(page,'Completed low guard')).toHaveCount(0);await expect(taskRow(page,'Filtered old title')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  80  |     await taskRow(page,'Filtered old title').getByRole('textbox',{name:'New task title',exact:true}).fill('Filtered new title');
  81  |     await taskRow(page,'Filtered old title').getByRole('button',{name:'Rename task',exact:true}).click();
  82  |     await expectPersistedPriority(page,'Priority rename filters','Filtered new title','Low');
  83  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
> 84  |     await expect(filter(page).locator('option:checked')).toHaveText('Low');
      |                                                          ^ Error: expect(locator).toHaveText(expected) failed
  85  |     await expect(page.getByRole('checkbox',{name:'Complete Filtered new title',exact:true})).not.toBeChecked();
  86  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  87  |     await filter(page).selectOption({label:'High'});
  88  |     await expect(taskRow(page,'Filtered new title')).toHaveCount(0);
  89  |   });
  90  | 
  91  |   test('026 archived combined filters are readable without enabling task editing',async({page})=>{
  92  |     await createProject(page,'Archived combined filters');await openProject(page,'Archived combined filters');
  93  |     await createTask(page,'Archived high open');await createTask(page,'Archived normal completed');
  94  |     await priority(page,'Archived high open').selectOption({label:'High'});
  95  |     await expectPersistedPriority(page,'Archived combined filters','Archived high open','High');
  96  |     await page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true}).check();
  97  |     await expectPersistedCompletion(page,'Archived combined filters','Archived normal completed',true);
  98  |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  99  |     await projectRow(page,'Archived combined filters').getByRole('button',{name:'Archive project',exact:true}).click();
  100 |     await expect(projectRow(page,'Archived combined filters')).toHaveCount(0);
  101 |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  102 |     await openProject(page,'Archived combined filters');
  103 |     await expect(filter(page)).toBeEnabled();await expect(completion(page)).toBeEnabled();
  104 |     await completion(page).selectOption({label:'Open'});await filter(page).selectOption({label:'High'});
  105 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  106 |     await expect(priority(page,'Archived high open')).toBeDisabled();
  107 |     await expect(page.getByRole('checkbox',{name:'Complete Archived high open',exact:true})).toBeDisabled();
  108 |     await expect(taskRow(page,'Archived high open').getByRole('textbox',{name:'New task title',exact:true})).toBeDisabled();
  109 |     await completion(page).selectOption({label:'Completed'});await filter(page).selectOption({label:'Normal'});
  110 |     await expect(page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true})).toBeChecked();
  111 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  112 |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  113 |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  114 |     await projectRow(page,'Archived combined filters').getByRole('button',{name:'Restore project',exact:true}).click();
  115 |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});
  116 |     await openProject(page,'Archived combined filters');
  117 |     await expect(filter(page).locator('option:checked')).toHaveText('All');
  118 |     await expect(priority(page,'Archived high open')).toBeEnabled();
  119 |     await expect(priority(page,'Archived high open').locator('option:checked')).toHaveText('High');
  120 |     await expect(page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true})).toBeChecked();
  121 |   });
  122 | }
  123 | 
```