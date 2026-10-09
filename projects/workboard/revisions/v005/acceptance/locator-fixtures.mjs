import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { projectRow, taskRow } from './helpers.mjs';

const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  for (const markup of [
    '<div data-testid="project-row">Alpha<button>Open project</button></div>',
    '<div data-testid="project-row"><span>Alpha</span><button>Open project</button></div>'
  ]) {
    await page.setContent(markup);
    assert.equal(await projectRow(page, 'Alpha').count(), 1);
    assert.equal(await projectRow(page, 'Beta').count(), 0);
    assert.equal(await projectRow(page, 'Alpha').getByRole('button', {name:'Open project'}).count(), 1);
  }
  for (const markup of [
    '<div data-testid="task-row">Remember me<input type="checkbox" aria-label="Complete Remember me"></div>',
    '<div data-testid="task-row"><span>Remember me</span><input type="checkbox" aria-label="Complete Remember me"></div>',
    '<div data-testid="task-row"><label><input type="checkbox">Complete Remember me</label></div>'
  ]) {
    await page.setContent(markup);
    assert.equal(await taskRow(page, 'Remember me').count(), 1);
    assert.equal(await taskRow(page, 'Other task').count(), 0);
    assert.equal(await taskRow(page, 'Remember me').getByRole('checkbox', {name:'Complete Remember me'}).count(), 1);
  }
  console.log('Five valid row representations and their negative name/control checks passed.');
} finally {
  await browser.close();
}
