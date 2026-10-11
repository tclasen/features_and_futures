import { expectPersistedCompletion, expectPersistedPriority, assertDisclosedControls } from './helpers.mjs';
import { requiredAlert } from './helpers.mjs';
import { test, expect } from '@playwright/test';
import { stage, projectName, projectRow, taskRow, createProject, openProject, createTask, isolateBrowser } from './helpers.mjs';

test.beforeEach(async ({ context }) => { await isolateBrowser(context); });

test('001 health and project creation persist on reload', async ({ page, request }) => {
  const health = await request.get('/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Workboard', exact: true })).toBeVisible();
  await createProject(page, '  Alpha create  ');
  await assertDisclosedControls(page, stage);
  await page.reload();
  await expect(projectRow(page, 'Alpha create')).toBeVisible();
  await openProject(page, 'Alpha create');
  await assertDisclosedControls(page, stage);
  expect(new URL(page.url()).pathname).toMatch(/^\/projects\/[^/]+$/);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(projectRow(page, 'Alpha create')).toBeVisible();
});

test('002 blank project input is rejected', async ({ page }) => {
  await createProject(page, 'Blank validation sentinel');
  await page.reload();
  await expect(projectRow(page, 'Blank validation sentinel')).toBeVisible();
  const rows = await page.getByTestId('project-row').filter({ visible: true }).count();
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  await page.reload();
  await expect(projectRow(page, 'Blank validation sentinel')).toBeVisible();
  await expect(page.getByTestId('project-row').filter({ visible: true })).toHaveCount(rows);
});

test('003 project creation order', async ({ page }) => {
  await createProject(page, 'Order first');
  await createProject(page, 'Order second');
  const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  expect(rows.findIndex(t => t.includes(projectName('Order first')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Order second'))));
});

if (stage >= 2) {
  test('004 trimmed tasks and project URL survive reload', async ({ page }) => {
    await createProject(page, 'Task reload');
    await openProject(page, 'Task reload');
    await createTask(page, '  Task preserved  ');
    await page.reload();
    await expect(page.getByRole('heading', { name: projectName('Task reload'), exact: true }).first()).toBeVisible();
    await expect(taskRow(page, 'Task preserved')).toBeVisible();
  });

  test('005 blank task input is rejected', async ({ page }) => {
    await createProject(page, 'Task invalid');
    await openProject(page, 'Task invalid');
    await page.getByRole('textbox', { name: 'Task title', exact: true }).fill('   ');
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
    await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  });

  test('006 tasks do not cross project boundaries', async ({ page }) => {
    await createProject(page, 'Task owner');
    await openProject(page, 'Task owner');
    await createTask(page, 'Private to owner');
    await createProject(page, 'Other project');
    await openProject(page, 'Other project');
    await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  });

  test('007 task filters and completion state persist', async ({ page }) => {
    await createProject(page, 'Task filters');
    await openProject(page, 'Task filters');
    await expect(page.getByRole('combobox', { name: 'Task filter', exact: true }).locator('option:checked')).toHaveText('All');
    await createTask(page, 'Done task');
    await createTask(page, 'Open task');
    await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Complete Open task', exact: true })).not.toBeChecked();
    const orderedTasks = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
    expect(orderedTasks.findIndex(t => t.includes('Done task'))).toBeLessThan(orderedTasks.findIndex(t => t.includes('Open task')));
    await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).check();
    await expectPersistedCompletion(page, 'Task filters', 'Done task', true);
    await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
    await expect(taskRow(page, 'Open task')).toBeVisible();
    await expect(taskRow(page, 'Done task')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
    await expect(taskRow(page, 'Done task')).toBeVisible();
    await expect(taskRow(page, 'Open task')).toHaveCount(0);
    await page.reload();
    await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
    await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
    await expectPersistedCompletion(page, 'Task filters', 'Done task', false);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  });
}

if (stage >= 3) {
  test('008 archive state persists and project can be restored', async ({ page }) => {
    await createProject(page, 'Archive lifecycle');
    await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
    await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
    await page.reload();
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
    await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
    await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  });

  test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
    await createProject(page, 'Archive tasks');
    await openProject(page, 'Archive tasks');
    await createTask(page, 'Retained task');
    await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
    await expectPersistedCompletion(page, 'Archive tasks', 'Retained task', true);
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
    await expect(projectRow(page, 'Archive tasks')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await openProject(page, 'Archive tasks');
    await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
    await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
    await expect(taskRow(page, 'Retained task')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
    await expect(taskRow(page, 'Retained task')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
    await openProject(page, 'Archive tasks');
    await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  });

  test('010 completion summaries reflect all tasks', async ({ page }) => {
    await createProject(page, 'Summary project');
    await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
    await openProject(page, 'Summary project');
    await createTask(page, 'Summary one');
    await createTask(page, 'Summary two');
    await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
    await expectPersistedCompletion(page, 'Summary project', 'Summary one', true);
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  });
}

test('011 seed process-restart persistence checks', async ({ page }) => {
  await createProject(page, 'Persistence sentinel');
  if (stage >= 2) {
    await openProject(page, 'Persistence sentinel');
    await createTask(page, 'Remember me');
    await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
    await expectPersistedCompletion(page, 'Persistence sentinel', 'Remember me', true);
    if (stage >= 6) {
      await taskRow(page, 'Remember me').getByRole('combobox', {name:'Task priority', exact:true}).selectOption({label:'High'});
      await expectPersistedPriority(page, 'Persistence sentinel', 'Remember me', 'High');
    }
    if (stage >= 5) {
      await taskRow(page, 'Remember me').getByRole('textbox', { name: 'New task title', exact: true }).fill('Memory kept');
      await taskRow(page, 'Remember me').getByRole('button', { name: 'Rename task', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: 'Complete Memory kept', exact: true })).toBeChecked();
    }
  }
  if (stage >= 4) {
    await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
    await page.getByRole('button', { name: 'Rename project', exact: true }).click();
    await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  }
  if (stage >= 8) {
    await page.getByRole('combobox', {name:'Default task priority', exact:true}).selectOption({label:'Low'});
    const observer=await page.context().newPage();
    try {
      await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Persistence renamed');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');
    } finally {await observer.close();}
  }
  if (stage >= 3) {
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
    await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  }
});

if (stage >= 4) {
  test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
    await createProject(page, 'Identity first');
    await createProject(page, 'Identity second');
    await openProject(page, 'Identity first');
    const originalPath = new URL(page.url()).pathname;
    await createTask(page, 'Identity task');
    await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
    await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
    await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
    await page.getByRole('button', { name: 'Rename project', exact: true }).click();
    await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(originalPath);
    await page.reload();
    await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(projectRow(page, 'Identity first')).toHaveCount(0);
    await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
    const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
    expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
    await openProject(page, 'Identity updated');
    expect(new URL(page.url()).pathname).toBe(originalPath);
  });

  test('014 blank rename preserves original name', async ({ page }) => {
    await createProject(page, 'Rename invalid');
    await openProject(page, 'Rename invalid');
    await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
    await page.getByRole('button', { name: 'Rename project', exact: true }).click();
    await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
    await page.reload();
    await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  });

  test('015 archived rename controls become available after restoration', async ({ page }) => {
    await createProject(page, 'Rename archive');
    await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
    await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await openProject(page, 'Rename archive');
    await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
    await openProject(page, 'Rename archive');
    await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  });
}

if (stage >= 5) {
  test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
    await createProject(page, 'Task rename identity');
    await openProject(page, 'Task rename identity');
    await createTask(page, 'Name initial');
    await createTask(page, 'Name second');
    await page.getByRole('checkbox', { name: 'Complete Name initial', exact: true }).check();
    await expectPersistedCompletion(page, 'Task rename identity', 'Name initial', true);
    await taskRow(page, 'Name initial').getByRole('textbox', { name: 'New task title', exact: true }).fill('  Name updated  ');
    await taskRow(page, 'Name initial').getByRole('button', { name: 'Rename task', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
    const rows = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
    expect(rows.findIndex(t => t.includes('Name updated'))).toBeLessThan(rows.findIndex(t => t.includes('Name second')));
    await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
    await expect(taskRow(page, 'Name updated')).toHaveCount(0);
    await expect(taskRow(page, 'Name second')).toBeVisible();
    await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
    await expect(taskRow(page, 'Name updated')).toBeVisible();
    await expect(taskRow(page, 'Name second')).toHaveCount(0);
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(projectRow(page, 'Task rename identity').getByTestId('project-summary')).toHaveText('1/2 completed');
  });
  test('017 blank task rename preserves the original title', async ({ page }) => {
    await createProject(page, 'Task rename invalid');
    await openProject(page, 'Task rename invalid');
    await createTask(page, 'Kept title');
    await taskRow(page, 'Kept title').getByRole('textbox', { name: 'New task title', exact: true }).fill('   ');
    await taskRow(page, 'Kept title').getByRole('button', { name: 'Rename task', exact: true }).click();
    await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Complete Kept title', exact: true })).toBeVisible();
    await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(1);
  });
  test('018 archived task rename controls become enabled after restoration', async ({ page }) => {
    await createProject(page, 'Task rename archive');
    await openProject(page, 'Task rename archive');
    await createTask(page, 'Archived title');
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await projectRow(page, 'Task rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
    await expect(projectRow(page, 'Task rename archive')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await openProject(page, 'Task rename archive');
    await expect(taskRow(page, 'Archived title').getByRole('textbox', { name: 'New task title', exact: true })).toBeDisabled();
    await expect(taskRow(page, 'Archived title').getByRole('button', { name: 'Rename task', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await projectRow(page, 'Task rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
    await openProject(page, 'Task rename archive');
    await expect(taskRow(page, 'Archived title').getByRole('textbox', { name: 'New task title', exact: true })).toBeEnabled();
    await expect(taskRow(page, 'Archived title').getByRole('button', { name: 'Rename task', exact: true })).toBeEnabled();
  });
}
