import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: (['postrestart', 'upgrade'].includes(process.env.FF_PHASE) || process.env.FF_PHASE?.startsWith('observation-')) ? 'persistence.spec.mjs' : ['workboard.spec.mjs', 'priority.spec.mjs', 'priority-filter.spec.mjs', 'default-priority.spec.mjs', 'due-date.spec.mjs', 'due-range.spec.mjs', 'move-task.spec.mjs', 'return-order.spec.mjs', 'search.spec.mjs', 'search-whitespace.spec.mjs', 'notes.spec.mjs','deletion.spec.mjs','export.spec.mjs','import.spec.mjs','directory.spec.mjs','bulk-directory.spec.mjs','directory-order.spec.mjs','directory-summary.spec.mjs','directory-owners.spec.mjs','directory-deletion.spec.mjs','directory-deletion-position.spec.mjs','directory-deletion-restart.spec.mjs','directory-priority.spec.mjs','directory-priority-position.spec.mjs','directory-due-edit.spec.mjs','directory-due-position.spec.mjs','directory-notes-edit.spec.mjs','directory-notes-position.spec.mjs','directory-project-order.spec.mjs','directory-project-order-position.spec.mjs','workspace-export.spec.mjs','workspace-import.spec.mjs', 'notes-limit.spec.mjs','project-name-limit.spec.mjs'],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 20000,
  expect: { timeout: 5000 },
  reporter: [['json', { outputFile: process.env.FF_RESULT }]],
  use: {
    baseURL: process.env.FF_BASE_URL,
    browserName: 'chromium',
    serviceWorkers: 'block',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  outputDir: process.env.FF_OUTPUT
});
