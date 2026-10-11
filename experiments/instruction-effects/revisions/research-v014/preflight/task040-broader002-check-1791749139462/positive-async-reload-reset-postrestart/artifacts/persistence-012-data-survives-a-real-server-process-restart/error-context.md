# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.mjs >> 012 data survives a real server-process restart
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task040-full-prototype002-suite/persistence.spec.mjs:13:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('No matching tasks', { exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('No matching tasks', { exact: true }) with timeout 5000ms
  - waiting for getByText('No matching tasks', { exact: true })

```

```yaml
- heading "Task directory" [level=1]
- text: 1/1 completed task-040 Default restart first1/1 completed
- group:
  - button "Open project"
- group:
  - button "Complete visible tasks" [disabled]
- group:
  - button "Reopen visible tasks"
- group:
  - button "Delete visible tasks"
- group:
  - button "Restore visible tasks" [disabled]
- group:
  - text: Visible tasks priority
  - combobox "Visible tasks priority":
    - option "Low"
    - option "Normal" [selected]
    - option "High"
  - button "Set visible priority"
- group:
  - text: Visible tasks due date
  - textbox "Visible tasks due date"
  - button "Save visible due date"
- group:
  - text: Visible tasks notes
  - textbox "Visible tasks notes"
  - button "Save visible notes"
- group:
  - text: Visible projects default priority
  - combobox "Visible projects default priority":
    - option "Low"
    - option "Normal" [selected]
    - option "High"
  - button "Set visible project default"
- group:
  - button "Archive visible projects"
- group:
  - button "Restore visible projects" [disabled]
- group:
  - button "Export matching workspace"
- group:
  - button "Projects"
- text: Project default priority
- combobox "Project default priority":
  - option "All" [selected]
  - option "Low"
  - option "Normal"
  - option "High"
- text: Directory notes status
- combobox "Directory notes status":
  - option "All" [selected]
  - option "Empty"
  - option "Present"
- text: Directory due status
- combobox "Directory due status":
  - option "All" [selected]
  - option "Dated"
  - option "Undated"
- text: Directory search mode
- combobox "Directory search mode":
  - option "Phrase" [selected]
  - option "All words"
  - option "Any words"
  - option "Starts with"
- text: Directory order
- combobox "Directory order":
  - option "Original" [selected]
  - option "Priority"
  - option "Due date"
  - option "Title"
  - option "Project name"
- text: Project scope
- combobox "Project scope":
  - option "Active" [selected]
  - option "Archived"
- text: Task filter
- combobox "Task filter":
  - option "All" [selected]
  - option "Open"
  - option "Completed"
  - option "Deleted"
- text: Priority filter
- combobox "Priority filter":
  - option "All" [selected]
  - option "Low"
  - option "Normal"
  - option "High"
- group:
  - text: Directory search
  - textbox "Directory search": travelling-default40
  - button "Search directory"
- group:
  - text: Due from
  - textbox "Due from"
  - text: Due through
  - textbox "Due through"
  - button "Apply due range"
- text: DefaultRestart40 travelling-default40task-040 Default restart firstCompletedHigh3300-03-01 Default restart Ω kept
- group:
  - button "Open project"
```

# Test source

```ts
  1  | import {expect} from '@playwright/test';
  2  | import {stage,projectName,taskRow,openProject} from './helpers.mjs';
  3  | const taskRows=p=>p.getByTestId('task-row').filter({visible:true});
  4  | async function owner(p,name){await p.goto('/');await openProject(p,name);}
  5  | async function order(p,expected){await expect(taskRows(p)).toHaveCount(expected.length);for(const [i,title] of expected.entries())await expect(taskRows(p).nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  6  | export async function checkDirectoryOwnerDefaultEditPersistence(page,checkMoves=false){
  7  |  const a='Default restart first',b='Default restart second',travel='DefaultRestart'+stage+' travelling-default'+stage,before='Default before '+stage,after='Default after '+stage,hold='Default hold '+stage,later='Default later '+stage,date=String(3260+stage)+'-03-01';
  8  |  await owner(page,a);await expect(page.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('Low');await order(page,[before,travel,after]);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('  Default restart Ω\nkept  ');await expect(taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('checkbox',{name:'Complete '+travel,exact:true})).toBeChecked();
> 9  |  await page.goto('/');await page.getByRole('button',{name:'Task directory',exact:true}).click();const rows=page.getByTestId('directory-task-row').filter({visible:true});await expect(rows.getByTestId('directory-task-title').filter({hasText:travel}).first()).toBeVisible();const status=page.getByRole('combobox',{name:'Directory search mode',exact:true});await expect(status.locator('option:checked')).toHaveText('Phrase');await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(travel);await page.getByRole('button',{name:'Search directory',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([travel]);await status.selectOption({label:'Starts with'});await page.getByRole('textbox',{name:'Directory search',exact:true}).fill('travelling-default'+stage);await page.getByRole('button',{name:'Search directory',exact:true}).click();await expect(page.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(rows).toHaveCount(0);await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(travel);await page.getByRole('button',{name:'Search directory',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([travel]);await expect(rows.getByTestId('directory-task-due-date')).toHaveText([date]);await expect(page.getByTestId('directory-summary')).toHaveText('1/1 completed');
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ^ Error: expect(locator).toBeVisible() failed
  10 |  if(checkMoves){
  11 |   async function move(source,target,sourceOrder,targetOrder){await owner(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const o=await page.context().newPage();try{await owner(o,target);await order(o,targetOrder);await owner(o,source);await order(o,sourceOrder);}finally{await o.close();}}
  12 |   await move(a,b,[before,after],[hold,travel,later]);await move(b,a,[hold,later],[before,travel,after]);
  13 |  }
  14 |  await owner(page,a);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('  Default restart Ω\nkept  ');await expect(page.getByRole('checkbox',{name:'Complete '+travel,exact:true})).toBeChecked();
  15 | }
  16 | 
```