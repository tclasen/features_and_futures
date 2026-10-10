# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.mjs >> 012 data survives a real server-process restart
- Location: experiments/instruction-effects/revisions/research-v003/decisions/task-014-draft/suite/persistence.spec.mjs:4:1

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 4
Received length: 0
Received array:  []
```

# Page snapshot

```yaml
- generic [active] [ref=f6e1]:
  - heading "task-014 Position first owner" [level=1] [ref=f6e2]
  - group [ref=f6e4]:
    - button "Projects" [ref=f6e5]
  - group [ref=f6e7]:
    - generic [ref=f6e8]:
      - text: Task search
      - textbox "Task search" [ref=f6e9]
    - button "Search tasks" [ref=f6e10]
  - group [ref=f6e12]:
    - generic [ref=f6e13]:
      - text: Due from
      - textbox "Due from" [ref=f6e14]
    - generic [ref=f6e15]:
      - text: Due through
      - textbox "Due through" [ref=f6e16]
    - button "Apply due range" [ref=f6e17]
  - group [ref=f6e19]:
    - generic [ref=f6e20]:
      - text: New project name
      - textbox "New project name" [ref=f6e21]
    - button "Rename project" [ref=f6e22]
  - generic [ref=f6e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f6e25]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f6e27]:
    - generic [ref=f6e28]:
      - text: Task title
      - textbox "Task title" [ref=f6e29]
    - button "Create task" [ref=f6e30]
  - generic [ref=f6e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f6e33]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f6e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f6e36]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { stage, projectRow, openProject, isolateBrowser } from './helpers.mjs';
  3  | 
  4  | test('012 data survives a real server-process restart', async ({ page, context }) => {
  5  |   await isolateBrowser(context);
  6  |   await page.goto('/');
  7  |   if (stage >= 3) {
  8  |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  9  |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByTestId('project-summary')).toHaveText('1/1 completed');
  10 |   }
  11 |   await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toBeVisible();
  12 |   await openProject(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel');
  13 |   if (stage >= 2) {
  14 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeChecked();
  15 |   }
  16 |   if(stage>=13) {await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Search tasks',exact:true})).toBeEnabled();}
  17 |   if (stage >= 10) {
  18 |     await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('');
  19 |     await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('');
  20 |     await expect(page.getByRole('button',{name:'Apply due range',exact:true})).toBeEnabled();
  21 |   }
  22 |   if (stage >= 9) {
  23 |     const date=page.getByTestId('task-row').filter({hasText:'Memory kept'}).getByRole('textbox',{name:'Task due date',exact:true});
  24 |     await expect(date).toHaveValue('2028-02-29');
  25 |     await expect(date).toBeDisabled();
  26 |     await expect(page.getByTestId('task-row').filter({hasText:'Memory kept'}).getByRole('button',{name:'Save due date',exact:true})).toBeDisabled();
  27 |   }
  28 |   if (stage >= 8) {
  29 |     const defaults=page.getByRole('combobox', {name:'Default task priority', exact:true});
  30 |     await expect(defaults.locator('option:checked')).toHaveText('Low');
  31 |     await expect(defaults).toBeDisabled();
  32 |   }
  33 |   if (stage >= 6) {
  34 |     const priority=page.getByTestId('task-row').filter({hasText:'Memory kept'}).getByRole('combobox', {name:'Task priority', exact:true});
  35 |     await expect(priority.locator('option:checked')).toHaveText('High');
  36 |     await expect(priority).toBeDisabled();
  37 |   }
  38 |   if (stage >= 3) {
  39 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeDisabled();
  40 |   }
  41 |   if(stage>=11) {
  42 |     await page.goto('/');await openProject(page,'Transfer restart origin');
  43 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  44 |   }
  45 | 
  46 |   if(stage>=12) {
  47 |     await page.goto('/');await openProject(page,'Position first owner');
  48 |     const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
> 49 |     expect(rows).toHaveLength(4);
     |                  ^ Error: expect(received).toHaveLength(expected)
  50 |     for(const [index,title] of ['First existing','Position travelling','First later','First newly created'].entries())expect(rows[index]).toContain(title);
  51 |   }
  52 | 
  53 | });
  54 | 
```