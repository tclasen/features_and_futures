import assert from 'node:assert/strict';
import {chromium, expect} from '@playwright/test';
import {assertDisclosedControls} from './helpers.mjs';

const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 const controls=[[2,'Create task'],[3,'Archive project'],[3,'Restore project'],[4,'Rename project'],[5,'Rename task']];
 for(const [introduced,name] of controls) {
  await page.setContent(`<button>${name}</button>`);
  await assert.rejects(()=>assertDisclosedControls(page,introduced-1));
  await assertDisclosedControls(page,introduced);
  await page.setContent(`<button hidden>${name}</button><button>Change theme</button>`);
  await assertDisclosedControls(page,introduced-1);
 }
 console.log('Known undispatched business controls reject; disclosed controls and independent presentation pass.');
} finally {await browser.close();}
