import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({headless:true});
try {
  for (const wronglyCreates of [false, true]) {
    const page = await browser.newPage();
    await page.setContent(`<main><input aria-label="Project name"><button>Create project</button><div role="alert" hidden></div><section></section></main><script>
      function append(name) {const row=document.createElement('div');row.dataset.testid='project-row';row.textContent=name;document.querySelector('section').append(row);}
      window.finishInitialLoad=()=>append('Known persisted project');
      document.querySelector('button').onclick=()=>{const alert=document.querySelector('[role=alert]');alert.hidden=false;alert.textContent='Project name is required';${wronglyCreates ? "append('Incorrect blank project');" : ''}};
    </script>`);
    const rows = page.getByTestId('project-row').filter({visible:true});
    const unsynchronized = await rows.count();
    await page.evaluate(()=>window.finishInitialLoad());
    await expect(rows.filter({hasText:'Known persisted project'})).toBeVisible();
    const synchronized = await rows.count();
    assert.equal(unsynchronized,0);
    assert.equal(synchronized,1);
    await page.getByRole('textbox',{name:'Project name'}).fill('   ');
    await page.getByRole('button',{name:'Create project'}).click();
    await expect(page.getByRole('alert')).toContainText('Project name is required');
    assert.equal(await rows.count(),wronglyCreates ? synchronized+1 : synchronized);
    if (!wronglyCreates) assert.notEqual(await rows.count(),unsynchronized);
    await page.close();
  }
  console.log('Delayed valid list passes synchronized count; forbidden blank creation remains observable.');
} finally {
  await browser.close();
}
