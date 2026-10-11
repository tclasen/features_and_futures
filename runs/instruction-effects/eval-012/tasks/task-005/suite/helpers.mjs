import { expect } from '@playwright/test';
export const stage = Number(process.env.FF_STAGE);
export function projectName(name) {
  return (process.env.FF_FIXTURE_PREFIX ? process.env.FF_FIXTURE_PREFIX + ' ' : '') + name.trim();
}
export function projectRow(page, name) {
  return page.getByTestId('project-row').filter({ hasText: projectName(name) }).filter({ visible: true });
}
export function taskRow(page, title) {
  return page.getByTestId('task-row').filter({ hasText: title }).filter({ visible: true });
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
  await expect(taskRow(page, title.trim()).getByRole('checkbox', { name: 'Complete ' + title.trim(), exact: true })).toBeVisible();
}
export async function isolateBrowser(context) {
  await context.routeWebSocket('**/*', socket => socket.close());
  const origin = new URL(process.env.FF_BASE_URL).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
}

export function requiredAlert(page, message) {
  return page.getByRole('alert').filter({ hasText: message }).filter({ visible: true }).first();
}

export async function assertDisclosedControls(page, checkpoint) {
  const deferred = [
    [2, 'Create task'], [3, 'Archive project'], [3, 'Restore project'],
    [4, 'Rename project'], [5, 'Rename task']
  ];
  for (const [introduced, name] of deferred) {
    if (checkpoint < introduced) {
      await expect(page.getByRole('button', {name, exact:true}).filter({visible:true})).toHaveCount(0);
    }
  }
}

export async function expectPersistedCompletion(page, project, title, completed) {
  const observer = await page.context().newPage();
  try {
    await expect.poll(async () => {
      await observer.goto('/');
      await openProject(observer, project);
      await observer.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'All'});
      await expect(taskRow(observer, title)).toBeVisible();
      return observer.getByRole('checkbox', {name:'Complete '+title, exact:true}).isChecked();
    }, {timeout:5000, message:'Completion state must be durable before the next navigation'}).toBe(completed);
  } finally { await observer.close(); }
}
