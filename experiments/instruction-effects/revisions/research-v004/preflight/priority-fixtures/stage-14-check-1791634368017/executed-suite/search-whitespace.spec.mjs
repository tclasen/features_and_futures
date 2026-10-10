import {test,expect} from '@playwright/test';
import {stage,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority} from './helpers.mjs';
test.beforeEach(async({context})=>{await isolateBrowser(context);});
if(stage>=14){
 test('050 task search collapses spaces tabs without changing stored titles or filters',async({page})=>{
  await createProject(page,'Whitespace retained owner');await openProject(page,'Whitespace retained owner');await createTask(page,'Original  task gap');await createTask(page,'Other task gap');await taskRow(page,'Original  task gap').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Whitespace retained owner','Original  task gap','High');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});
  for(const query of [' original task ','ORIGINAL   TASK','original\t task']){
   await page.getByRole('textbox',{name:'Task search',exact:true}).fill(query);await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Original  task gap')).toBeVisible();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  }
  await page.getByRole('textbox',{name:'Task search',exact:true}).fill('');await page.getByRole('button',{name:'Search tasks',exact:true}).click();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await page.reload();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');
 });
 test('051 project whitespace matching retains original names and archived intersection',async({page})=>{
  await createProject(page,'Whitespace   Saved first');await createProject(page,'Whitespace Saved second');await createProject(page,'Whitespace  Saved archived');await projectRow(page,'Whitespace  Saved archived').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Whitespace  Saved archived')).toHaveCount(0);
  for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\t saved']){
   await page.getByRole('textbox',{name:'Project search',exact:true}).fill(projectName(query));await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(2);const rows=await page.getByTestId('project-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Whitespace   Saved first');expect(rows[1]).toContain('Whitespace Saved second');
  }
  await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');await page.reload();expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');
 });
}
