import { expect } from '@playwright/test';
export const stage = Number(process.env.FF_STAGE);
export function projectName(name) {
  return (process.env.FF_FIXTURE_PREFIX ? process.env.FF_FIXTURE_PREFIX + ' ' : '') + name.trim();
}
export function projectRow(page, name) {
  return page.getByTestId('project-row').filter({ has: page.getByText(projectName(name), { exact: true }) });
}
export function taskRow(page, title) {
  return page.getByTestId('task-row').filter({ has: page.getByText(title, { exact: true }) });
}
export async function createProject(page, name) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name === name.trim() ? projectName(name) : '  ' + projectName(name) + '  ');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(projectRow(page, name.trim())).toBeVisible();
}
export async function openProject(page, name) {
  await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
  await expect(page.getByRole('heading', { name: projectName(name), exact: true }).first()).toBeVisible();
}
export async function createTask(page, title) {
  await page.getByRole('textbox', { name: 'Task title', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(taskRow(page, title.trim())).toBeVisible();
}
export async function isolateBrowser(context) {
  await context.routeWebSocket('**/*', socket => socket.close());
  const origin = new URL(process.env.FF_BASE_URL).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
}
