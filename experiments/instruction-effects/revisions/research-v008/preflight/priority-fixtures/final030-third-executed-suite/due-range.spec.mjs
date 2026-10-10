import {test,expect} from '@playwright/test';
import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority,requiredAlert} from './helpers.mjs';
const from=page=>page.getByRole('textbox',{name:'Due from',exact:true});
const through=page=>page.getByRole('textbox',{name:'Due through',exact:true});
const completion=page=>page.getByRole('combobox',{name:'Task filter',exact:true});
const priorityFilter=page=>page.getByRole('combobox',{name:'Priority filter',exact:true});
async function range(page,a,b){await from(page).fill(a);await through(page).fill(b);await page.getByRole('button',{name:'Apply due range',exact:true}).click();}
async function saveDate(page,project,title,value){
 await taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:'Save due date',exact:true}).click();
 const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}
}
test.beforeEach(async({context})=>{await isolateBrowser(context);});
if(stage>=10){
 test('034 date ranges include endpoints exclude undated tasks and preserve order',async({page})=>{
  await createProject(page,'Range boundaries');await openProject(page,'Range boundaries');await expect(from(page)).toHaveValue('');await expect(through(page)).toHaveValue('');
  for(const title of ['Before range','Range first','No calendar date','Range last','After range'])await createTask(page,title);
  for(const [title,value] of [['Before range','2028-02-28'],['Range first','2028-02-29'],['Range last','2028-03-02'],['After range','2028-03-03']])await saveDate(page,'Range boundaries',title,value);
  await range(page,' 2028-02-29 ',' 2028-03-02 ');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  let rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Range first');expect(rows[1]).toContain('Range last');
  await range(page,'','2028-02-29');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await expect(taskRow(page,'Before range')).toBeVisible();await expect(taskRow(page,'Range first')).toBeVisible();
  await range(page,'2028-03-02','');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await expect(taskRow(page,'Range last')).toBeVisible();await expect(taskRow(page,'After range')).toBeVisible();
  await range(page,'','');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(5);
 });
 test('035 due ranges intersect completion priority and live date edits',async({page})=>{
  await createProject(page,'Range intersections');await openProject(page,'Range intersections');
  for(const title of ['Range matching','Range low','Range completed','Range undated'])await createTask(page,title);
  for(const title of ['Range matching','Range completed','Range undated']){await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Range intersections',title,'High');}
  for(const title of ['Range matching','Range low','Range completed'])await saveDate(page,'Range intersections',title,'2029-01-15');
  await page.getByRole('checkbox',{name:'Complete Range completed',exact:true}).check();await expectPersistedCompletion(page,'Range intersections','Range completed',true);
  await completion(page).selectOption({label:'Open'});await priorityFilter(page).selectOption({label:'High'});await range(page,'2029-01-01','2029-01-31');
  await expect(completion(page).locator('option:checked')).toHaveText('Open');await expect(priorityFilter(page).locator('option:checked')).toHaveText('High');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  await saveDate(page,'Range intersections','Range matching','2029-02-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  await expect(from(page)).toHaveValue('2029-01-01');await expect(through(page)).toHaveValue('2029-01-31');
  await completion(page).selectOption({label:'Completed'});await expect(taskRow(page,'Range completed')).toBeVisible();await expect(from(page)).toHaveValue('2029-01-01');
  await page.getByRole('checkbox',{name:'Complete Range completed',exact:true}).uncheck();await expectPersistedCompletion(page,'Range intersections','Range completed',false);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  await completion(page).selectOption({label:'Open'});await taskRow(page,'Range completed').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'Low'});await expectPersistedPriority(page,'Range intersections','Range completed','Low');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  await priorityFilter(page).selectOption({label:'All'});await expect(from(page)).toHaveValue('2029-01-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Range intersections').getByTestId('project-summary')).toHaveText('0/4 completed');
 });
 test('036 invalid due ranges preserve the last applied membership',async({page})=>{
  await createProject(page,'Range validation');await openProject(page,'Range validation');await createTask(page,'Valid member');await createTask(page,'Undated outsider');await saveDate(page,'Range validation','Valid member','2028-06-15');
  await range(page,'2028-06-01','2028-06-30');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  for(const [a,b,message] of [['2028-02-30','2028-06-30','Due range must use valid YYYY-MM-DD dates'],['2028-06-01','bad','Due range must use valid YYYY-MM-DD dates'],['2028-07-01','2028-06-30','Due from must not be after Due through']]){
   await range(page,a,b);await expect(requiredAlert(page,message)).toBeVisible();await expect(taskRow(page,'Valid member')).toBeVisible();await expect(taskRow(page,'Undated outsider')).toHaveCount(0);
  }
  await range(page,'','');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
 });
 test('037 archived ranges stay usable and reopening clears transient boundaries',async({page})=>{
  await createProject(page,'Range archival');await openProject(page,'Range archival');await createTask(page,'Archived date member');await createTask(page,'Archived undated outsider');await saveDate(page,'Range archival','Archived date member','2030-01-01');
  await range(page,'2030-01-01','2030-01-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  await taskRow(page,'Archived date member').getByRole('textbox',{name:'New task title',exact:true}).fill('Archived date renamed');await taskRow(page,'Archived date member').getByRole('button',{name:'Rename task',exact:true}).click();await expect(taskRow(page,'Archived date renamed')).toBeVisible();await expect(from(page)).toHaveValue('2030-01-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Range archival').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Range archival')).toHaveCount(0);
  await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Range archival');await expect(from(page)).toBeEnabled();await expect(through(page)).toBeEnabled();await expect(from(page)).toHaveValue('');await expect(through(page)).toHaveValue('');
  await range(page,'2030-01-01','2030-01-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Archived date renamed').getByRole('textbox',{name:'Task due date',exact:true})).toBeDisabled();await expect(taskRow(page,'Archived date renamed').getByRole('button',{name:'Save due date',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Range archival').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Range archival');await expect(from(page)).toHaveValue('');await expect(through(page)).toHaveValue('');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await expect(taskRow(page,'Archived date renamed').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2030-01-01');
 });
 test('038 project default rename and hidden creation retain the applied range',async({page})=>{
  await createProject(page,'Range identity');await openProject(page,'Range identity');await createTask(page,'Retained range member');await createTask(page,'Retained undated outsider');
  await taskRow(page,'Retained range member').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Range identity','Retained range member','High');await saveDate(page,'Range identity','Retained range member','2031-03-01');
  await completion(page).selectOption({label:'Open'});await priorityFilter(page).selectOption({label:'High'});await range(page,'2031-03-01','2031-03-01');
  await page.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:'Low'});
  const observer=await page.context().newPage();
  try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Range identity');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');}finally{await observer.close();}
  await expect(from(page)).toHaveValue('2031-03-01');await expect(through(page)).toHaveValue('2031-03-01');await expect(completion(page).locator('option:checked')).toHaveText('Open');await expect(priorityFilter(page).locator('option:checked')).toHaveText('High');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Range owner renamed'));await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName('Range owner renamed'),exact:true}).first()).toBeVisible();
  await expect(from(page)).toHaveValue('2031-03-01');await expect(through(page)).toHaveValue('2031-03-01');await expect(completion(page).locator('option:checked')).toHaveText('Open');await expect(priorityFilter(page).locator('option:checked')).toHaveText('High');
  await page.getByRole('textbox',{name:'Task title',exact:true}).fill('Created outside range');await page.getByRole('button',{name:'Create task',exact:true}).click();
  await expectPersistedPriority(page,'Range owner renamed','Created outside range','Low');await expect(from(page)).toHaveValue('2031-03-01');await expect(through(page)).toHaveValue('2031-03-01');await expect(completion(page).locator('option:checked')).toHaveText('Open');await expect(priorityFilter(page).locator('option:checked')).toHaveText('High');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Range owner renamed').getByTestId('project-summary')).toHaveText('0/3 completed');await openProject(page,'Range owner renamed');await expect(taskRow(page,'Created outside range').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('');
 });

}
