import { test, expect } from '@playwright/test';
import { stage, projectName, projectRow, taskRow, openProject, isolateBrowser } from './helpers.mjs';
import {checkWorkspaceImportPersistence} from './workspace-persistence.mjs';
import {checkBulkDeletionPersistence} from './bulk-deletion-persistence.mjs';

test('012 data survives a real server-process restart', async ({ page, context }) => {
  if(stage>=24)test.setTimeout(90000);
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
  if(stage>=15){await expect(taskRow(page,'Memory kept').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('');await expect(taskRow(page,'Memory kept').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();await expect(taskRow(page,'Memory kept').getByRole('button',{name:'Save notes',exact:true})).toBeDisabled();}
  if(stage>=13) {await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Search tasks',exact:true})).toBeEnabled();}
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

  if(stage>=16){await page.goto('/');await expect(projectRow(page,'Deletion restart').getByTestId('project-summary')).toHaveText('0/0 completed');await openProject(page,'Deletion restart');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,'Deleted memory').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Original deleted note\nretained');await expect(taskRow(page,'Deleted memory').getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await expect(taskRow(page,'Deleted memory').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();}

  if(stage>=18){await page.goto('/');await expect(projectRow(page,'Import restart').getByTestId('project-summary')).toHaveText('0/1 completed');await openProject(page,'Import restart');await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Live import');await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2044-02-29');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,'Imported deleted').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Import Ω\nretained');await expect(taskRow(page,'Imported deleted').getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await expect(page.getByRole('checkbox',{name:'Complete Imported deleted',exact:true})).toBeChecked();}

  if(stage>=20){for(const owner of ['Bulk restart first','Bulk restart second']){await page.goto('/');await expect(projectRow(page,owner).getByTestId('project-summary')).toHaveText('1/1 completed');await openProject(page,owner);const title=projectName('Bulk restart record')+' '+owner;await expect(page.getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeChecked();await expect(taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2052-02-29');await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Bulk restart Ω\noriginal');}}

  if(stage>=30)await checkWorkspaceImportPersistence(page,['postrestart','upgrade'].includes(process.env.FF_PHASE));
  if(stage>=24)await checkBulkDeletionPersistence(page,['postrestart','upgrade'].includes(process.env.FF_PHASE));
});
