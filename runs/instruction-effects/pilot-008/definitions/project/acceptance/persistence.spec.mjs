import { test, expect } from '@playwright/test';
import { stage, projectRow, openProject, isolateBrowser } from './helpers.mjs';

test('012 data survives a real server-process restart', async ({ page, context }) => {
  await isolateBrowser(context);
  await page.goto('/');
  if (stage >= 3) {
    await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
    await expect(projectRow(page, 'Persistence sentinel').getByTestId('project-summary')).toHaveText('1/1 completed');
  }
  await expect(projectRow(page, 'Persistence sentinel')).toBeVisible();
  await openProject(page, 'Persistence sentinel');
  if (stage >= 2) {
    await expect(page.getByRole('checkbox', { name: 'Complete Remember me', exact: true })).toBeChecked();
  }
  if (stage >= 3) {
    await expect(page.getByRole('checkbox', { name: 'Complete Remember me', exact: true })).toBeDisabled();
  }
});
