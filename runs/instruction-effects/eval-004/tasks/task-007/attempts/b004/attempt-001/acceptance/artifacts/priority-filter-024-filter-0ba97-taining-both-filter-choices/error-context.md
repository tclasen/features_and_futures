# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority-filter.spec.mjs >> 024 filtered edits re-evaluate rows while retaining both filter choices
- Location: runs/instruction-effects/eval-004/tasks/task-007/suite/priority-filter.spec.mjs:42:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').filter({ hasText: 'Leaving priority' }).visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').filter({ hasText: 'Leaving priority' }).visible() with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ hasText: 'Leaving priority' }).visible()
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - generic [ref=f1e3]:
    - heading "task-007 Priority live filters" [level=1] [ref=f1e4]
    - button "Projects" [ref=f1e5] [cursor=pointer]
  - generic [ref=f1e6]:
    - generic [ref=f1e7]: New project name
    - textbox "New project name" [ref=f1e8]
    - button "Rename project" [ref=f1e9] [cursor=pointer]
    - alert [ref=f1e10]
  - generic [ref=f1e11]:
    - generic [ref=f1e12]: Task title
    - textbox "Task title" [ref=f1e13]
    - button "Create task" [active] [ref=f1e14] [cursor=pointer]
    - alert [ref=f1e15]
  - generic [ref=f1e16]:
    - generic [ref=f1e17]: Task filter
    - combobox "Task filter" [ref=f1e18]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
    - generic [ref=f1e19]: Priority filter
    - combobox "Priority filter" [ref=f1e20]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - region "Tasks" [ref=f1e21]:
    - generic [ref=f1e22]:
      - generic [ref=f1e23]:
        - checkbox "Complete Leaving priority" [ref=f1e24]
        - text: Leaving priority
      - combobox "Task priority" [ref=f1e25]:
        - option "Low" [selected]
        - option "Normal"
        - option "High"
      - alert
      - textbox "New task title" [ref=f1e26]: Leaving priority
      - button "Rename task" [ref=f1e27] [cursor=pointer]
    - generic [ref=f1e28]:
      - generic [ref=f1e29]:
        - checkbox "Complete Leaving completion" [ref=f1e30]
        - text: Leaving completion
      - combobox "Task priority" [ref=f1e31]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - alert
      - textbox "New task title" [ref=f1e32]: Leaving completion
      - button "Rename task" [ref=f1e33] [cursor=pointer]
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
  49  |     await completion(page).selectOption({label:'Open'});await filter(page).selectOption({label:'High'});
  50  |     await priority(page,'Leaving priority').selectOption({label:'Low'});
  51  |     await expectPersistedPriority(page,'Priority live filters','Leaving priority','Low');
> 52  |     await expect(taskRow(page,'Leaving priority')).toHaveCount(0);
      |                                                    ^ Error: expect(locator).toHaveCount(expected) failed
  53  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  54  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
  55  |     await page.getByRole('checkbox',{name:'Complete Leaving completion',exact:true}).check();
  56  |     await expectPersistedCompletion(page,'Priority live filters','Leaving completion',true);
  57  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  58  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  59  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
  60  |     await completion(page).selectOption({label:'Completed'});
  61  |     await expect(taskRow(page,'Leaving completion')).toBeVisible();
  62  |     await expect(priority(page,'Leaving completion').locator('option:checked')).toHaveText('High');
  63  |     await page.getByRole('checkbox',{name:'Complete Leaving completion',exact:true}).uncheck();
  64  |     await expectPersistedCompletion(page,'Priority live filters','Leaving completion',false);
  65  |     await expect(taskRow(page,'Leaving completion')).toHaveCount(0);
  66  |     await expect(completion(page).locator('option:checked')).toHaveText('Completed');
  67  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  68  |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  69  |     await expect(projectRow(page,'Priority live filters').getByTestId('project-summary')).toHaveText('0/2 completed');
  70  |   });
  71  | 
  72  |   test('025 task rename retains combined filter membership',async({page})=>{
  73  |     await createProject(page,'Priority rename filters');await openProject(page,'Priority rename filters');
  74  |     await createTask(page,'Filtered old title');await createTask(page,'Unmatched normal task');
  75  |     await priority(page,'Filtered old title').selectOption({label:'Low'});
  76  |     await expectPersistedPriority(page,'Priority rename filters','Filtered old title','Low');
  77  |     await filter(page).selectOption({label:'Low'});await completion(page).selectOption({label:'Open'});
  78  |     await taskRow(page,'Filtered old title').getByRole('textbox',{name:'New task title',exact:true}).fill('Filtered new title');
  79  |     await taskRow(page,'Filtered old title').getByRole('button',{name:'Rename task',exact:true}).click();
  80  |     await expectPersistedPriority(page,'Priority rename filters','Filtered new title','Low');
  81  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
  82  |     await expect(filter(page).locator('option:checked')).toHaveText('Low');
  83  |     await expect(page.getByRole('checkbox',{name:'Complete Filtered new title',exact:true})).not.toBeChecked();
  84  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  85  |     await filter(page).selectOption({label:'High'});
  86  |     await expect(taskRow(page,'Filtered new title')).toHaveCount(0);
  87  |   });
  88  | 
  89  |   test('026 archived combined filters are readable without enabling task editing',async({page})=>{
  90  |     await createProject(page,'Archived combined filters');await openProject(page,'Archived combined filters');
  91  |     await createTask(page,'Archived high open');await createTask(page,'Archived normal completed');
  92  |     await priority(page,'Archived high open').selectOption({label:'High'});
  93  |     await expectPersistedPriority(page,'Archived combined filters','Archived high open','High');
  94  |     await page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true}).check();
  95  |     await expectPersistedCompletion(page,'Archived combined filters','Archived normal completed',true);
  96  |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  97  |     await projectRow(page,'Archived combined filters').getByRole('button',{name:'Archive project',exact:true}).click();
  98  |     await expect(projectRow(page,'Archived combined filters')).toHaveCount(0);
  99  |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  100 |     await openProject(page,'Archived combined filters');
  101 |     await expect(filter(page)).toBeEnabled();await expect(completion(page)).toBeEnabled();
  102 |     await completion(page).selectOption({label:'Open'});await filter(page).selectOption({label:'High'});
  103 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  104 |     await expect(priority(page,'Archived high open')).toBeDisabled();
  105 |     await expect(page.getByRole('checkbox',{name:'Complete Archived high open',exact:true})).toBeDisabled();
  106 |     await expect(taskRow(page,'Archived high open').getByRole('textbox',{name:'New task title',exact:true})).toBeDisabled();
  107 |     await completion(page).selectOption({label:'Completed'});await filter(page).selectOption({label:'Normal'});
  108 |     await expect(page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true})).toBeChecked();
  109 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  110 |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  111 |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  112 |     await projectRow(page,'Archived combined filters').getByRole('button',{name:'Restore project',exact:true}).click();
  113 |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});
  114 |     await openProject(page,'Archived combined filters');
  115 |     await expect(filter(page).locator('option:checked')).toHaveText('All');
  116 |     await expect(priority(page,'Archived high open')).toBeEnabled();
  117 |     await expect(priority(page,'Archived high open').locator('option:checked')).toHaveText('High');
  118 |     await expect(page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true})).toBeChecked();
  119 |   });
  120 | }
  121 | 
```