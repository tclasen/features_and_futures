import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { requiredAlert } from './helpers.mjs';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.setContent('<p role="alert"></p><p role="alert">Task title is required</p>');
  assert.equal(await page.getByRole('alert').count(),2);
  assert.equal(await requiredAlert(page,'Task title is required').count(),1);
  await page.setContent('<p role="alert">Unrelated error</p><p>Task title is required</p>');
  assert.equal(await requiredAlert(page,'Task title is required').count(),0);
  await page.setContent('<p role="alert" hidden>Task title is required</p>');
  assert.equal(await requiredAlert(page,'Task title is required').count(),0);
  console.log('Required visible announcement accepted with unrelated empty alert; wrong role/message and hidden message rejected.');
} finally { await browser.close(); }
