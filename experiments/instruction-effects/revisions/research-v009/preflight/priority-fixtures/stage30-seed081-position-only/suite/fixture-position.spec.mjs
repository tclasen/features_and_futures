import {test} from '@playwright/test';
import {isolateBrowser} from './helpers.mjs';
import {checkBulkDeletionPersistence} from './bulk-deletion-persistence.mjs';
test('PM081 stored fields and own/foreign positions survive later traversal',async({page,context})=>{test.setTimeout(90000);await isolateBrowser(context);await checkBulkDeletionPersistence(page,true);});
