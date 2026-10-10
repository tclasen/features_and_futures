import { test, expect } from '@playwright/test';
import { stage, projectRow, taskRow, openProject, isolateBrowser } from './helpers.mjs';

test('012 data survives a real server-process restart', async ({ page, context }) => {
  await isolateBrowser(context);
  await page.goto('/');
  if (stage >= 3) {
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByTestId('project-summary')).toHaveText('1/1 completed');
  }
  await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toBeVisible();
  await openProject(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel');
  if (stage >= 2) {
    await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeChecked();
  }
  if (stage >= 10) {
    await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('');
    await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('');
    await expect(page.getByRole('button',{name:'Apply due range',exact:true})).toBeEnabled();
  }
  if (stage >= 9) {
    const date=taskRow(page,'Memory kept').getByRole('textbox',{name:'Task due date',exact:true});
    await expect(date).toHaveValue('2028-02-29');
    await expect(date).toBeDisabled();
    await expect(taskRow(page,'Memory kept').getByRole('button',{name:'Save due date',exact:true})).toBeDisabled();
  }
  if (stage >= 8) {
    const defaults=page.getByRole('combobox', {name:'Default task priority', exact:true});
    await expect(defaults.locator('option:checked')).toHaveText('Low');
    await expect(defaults).toBeDisabled();
  }
  if (stage >= 6) {
    const priority=taskRow(page,'Memory kept').getByRole('combobox', {name:'Task priority', exact:true});
    await expect(priority.locator('option:checked')).toHaveText('High');
    await expect(priority).toBeDisabled();
  }
  if (stage >= 3) {
    await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeDisabled();
  }
  if(stage>=11) {
    await page.goto('/');await openProject(page,'Transfer restart origin');
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  }

  if(stage>=12) {
    await page.goto('/');await openProject(page,'Position first owner');
    const rows=page.getByTestId('task-row').filter({visible:true});
    await expect(rows).toHaveCount(4);
    for(const [index,title] of ['First existing','Position travelling','First later','First newly created'].entries())await expect(rows.nth(index).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();
  }

});
