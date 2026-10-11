import {test, expect} from '@playwright/test';
import {stage, projectRow, taskRow, createProject, openProject, createTask, isolateBrowser, expectPersistedCompletion, expectPersistedPriority} from './helpers.mjs';

const priority = (page, title) => taskRow(page, title).getByRole('combobox', {name:'Task priority', exact:true});
test.beforeEach(async ({context}) => { await isolateBrowser(context); });

if (stage >= 6) {
  test('022 pre-priority archived data acquires Normal without changing completion', async ({page}) => {
    await page.goto('/');
    await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Archived'});
    const previous=page.getByTestId('project-row').filter({hasText:'task-005 Persistence renamed'}).filter({visible:true});
    await expect(previous.getByTestId('project-summary')).toHaveText('1/1 completed');
    await previous.getByRole('button', {name:'Open project', exact:true}).click();
    await expect(page.getByRole('checkbox', {name:'Complete Memory kept', exact:true})).toBeChecked();
    await expect(priority(page, 'Memory kept').locator('option:checked')).toHaveText('Normal');
    await expect(priority(page, 'Memory kept')).toBeDisabled();
  });

  test('019 independent priorities default to Normal and persist through rename', async ({page}) => {
    await createProject(page, 'Priority ownership');
    await openProject(page, 'Priority ownership');
    await createTask(page, 'Priority first');
    await createTask(page, 'Priority second');
    await expect(priority(page, 'Priority first').locator('option')).toHaveText(['Low','Normal','High']);
    await expect(priority(page, 'Priority first').locator('option:checked')).toHaveText('Normal');
    await expect(priority(page, 'Priority second').locator('option:checked')).toHaveText('Normal');
    await priority(page, 'Priority first').selectOption({label:'High'});
    await expectPersistedPriority(page, 'Priority ownership', 'Priority first', 'High');
    await page.reload();
    await expect(priority(page, 'Priority first').locator('option:checked')).toHaveText('High');
    await expect(priority(page, 'Priority second').locator('option:checked')).toHaveText('Normal');
    await priority(page, 'Priority second').selectOption({label:'Low'});
    await expectPersistedPriority(page, 'Priority ownership', 'Priority second', 'Low');
    await taskRow(page, 'Priority first').getByRole('textbox', {name:'New task title', exact:true}).fill('Priority renamed');
    await taskRow(page, 'Priority first').getByRole('button', {name:'Rename task', exact:true}).click();
    await expect(page.getByRole('checkbox', {name:'Complete Priority renamed', exact:true})).toBeVisible();
    await expectPersistedPriority(page, 'Priority ownership', 'Priority renamed', 'High');
    await page.reload();
    await expect(priority(page, 'Priority renamed').locator('option:checked')).toHaveText('High');
    await expect(priority(page, 'Priority second').locator('option:checked')).toHaveText('Low');
    const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
    expect(rows.findIndex(t=>t.includes('Priority renamed'))).toBeLessThan(rows.findIndex(t=>t.includes('Priority second')));
    await createProject(page, 'Priority other owner');
    await openProject(page, 'Priority other owner');
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
    await createTask(page, 'Priority other task');
    await expect(priority(page, 'Priority other task').locator('option:checked')).toHaveText('Normal');
  });

  test('020 priority edits preserve completion filters and summary', async ({page}) => {
    await createProject(page, 'Priority completion');
    await openProject(page, 'Priority completion');
    await createTask(page, 'Priority completed');
    await createTask(page, 'Priority open');
    await page.getByRole('checkbox', {name:'Complete Priority completed', exact:true}).check();
    await expectPersistedCompletion(page, 'Priority completion', 'Priority completed', true);
    await priority(page, 'Priority completed').selectOption({label:'Low'});
    await expectPersistedPriority(page, 'Priority completion', 'Priority completed', 'Low');
    await priority(page, 'Priority open').selectOption({label:'High'});
    await expectPersistedPriority(page, 'Priority completion', 'Priority open', 'High');
    await page.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'Completed'});
    await expect(taskRow(page, 'Priority open')).toHaveCount(0);
    await expect(page.getByRole('checkbox', {name:'Complete Priority completed', exact:true})).toBeChecked();
    await page.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'Open'});
    await expect(taskRow(page, 'Priority completed')).toHaveCount(0);
    await expect(page.getByRole('checkbox', {name:'Complete Priority open', exact:true})).not.toBeChecked();
    await page.getByRole('button', {name:'Projects', exact:true}).click();
    await expect(projectRow(page, 'Priority completion').getByTestId('project-summary')).toHaveText('1/2 completed');
  });

  test('021 archived priorities are read-only and restored unchanged', async ({page}) => {
    await createProject(page, 'Priority archive');
    await openProject(page, 'Priority archive');
    await createTask(page, 'Priority retained');
    await priority(page, 'Priority retained').selectOption({label:'High'});
    await expectPersistedPriority(page, 'Priority archive', 'Priority retained', 'High');
    await page.getByRole('button', {name:'Projects', exact:true}).click();
    await projectRow(page, 'Priority archive').getByRole('button', {name:'Archive project', exact:true}).click();
    await expect(projectRow(page, 'Priority archive')).toHaveCount(0);
    await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Archived'});
    await openProject(page, 'Priority archive');
    await expect(priority(page, 'Priority retained')).toBeDisabled();
    await expect(priority(page, 'Priority retained').locator('option:checked')).toHaveText('High');
    await page.getByRole('button', {name:'Projects', exact:true}).click();
    await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Archived'});
    await projectRow(page, 'Priority archive').getByRole('button', {name:'Restore project', exact:true}).click();
    await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Active'});
    await openProject(page, 'Priority archive');
    await expect(priority(page, 'Priority retained')).toBeEnabled();
    await expect(priority(page, 'Priority retained').locator('option:checked')).toHaveText('High');
    await priority(page, 'Priority retained').selectOption({label:'Normal'});
    await expectPersistedPriority(page, 'Priority archive', 'Priority retained', 'Normal');
  });
}
