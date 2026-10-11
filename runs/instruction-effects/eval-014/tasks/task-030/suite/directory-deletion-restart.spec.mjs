import {test} from '@playwright/test';
import {stage,isolateBrowser} from './helpers.mjs';
import {seedBulkDeletionPersistence} from './bulk-deletion-persistence.mjs';
if(stage>=24)test('081 seed bulk deletion restoration fields and remembered positions for actual restart',async({page,context})=>{test.setTimeout(90000);await isolateBrowser(context);await seedBulkDeletionPersistence(page);});
