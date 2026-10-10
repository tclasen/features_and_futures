import {test,expect} from '@playwright/test';
import {stage,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority,requiredAlert} from './helpers.mjs';
const date=(page,title)=>taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true});
const save=(page,title)=>taskRow(page,title).getByRole('button',{name:'Save due date',exact:true});
async function persistedDate(page,project,title,value) {
 const observer=await page.context().newPage();
 try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return date(observer,title).inputValue();},{timeout:5000}).toBe(value);} finally {await observer.close();}
}
test.beforeEach(async({context})=>{await isolateBrowser(context);});
if(stage>=9) {
 test('030 dates default empty save canonically survive rename and clear',async({page})=>{
  await createProject(page,'Calendar persistence');await openProject(page,'Calendar persistence');await createTask(page,'Calendar old title');
  await expect(date(page,'Calendar old title')).toHaveValue('');
  await date(page,'Calendar old title').fill(' 2028-02-29 ');await save(page,'Calendar old title').click();
  await persistedDate(page,'Calendar persistence','Calendar old title','2028-02-29');await page.reload();await expect(date(page,'Calendar old title')).toHaveValue('2028-02-29');
  await taskRow(page,'Calendar old title').getByRole('textbox',{name:'New task title',exact:true}).fill('Calendar renamed');
  await taskRow(page,'Calendar old title').getByRole('button',{name:'Rename task',exact:true}).click();
  await expect(date(page,'Calendar renamed')).toBeVisible();await persistedDate(page,'Calendar persistence','Calendar renamed','2028-02-29');
  await date(page,'Calendar renamed').fill('   ');await save(page,'Calendar renamed').click();await persistedDate(page,'Calendar persistence','Calendar renamed','');await page.reload();await expect(date(page,'Calendar renamed')).toHaveValue('');
 });
 test('031 invalid formats and impossible calendar dates preserve the saved date',async({page})=>{
  await createProject(page,'Calendar validation');await openProject(page,'Calendar validation');await createTask(page,'Calendar valid');
  await date(page,'Calendar valid').fill('2028-04-30');await save(page,'Calendar valid').click();await persistedDate(page,'Calendar validation','Calendar valid','2028-04-30');
  for(const bad of ['2027-02-29','2028-04-31','2028-13-01','2028-00-10','0000-01-01','28-01-01','2028-1-01','not a date']) {
   await date(page,'Calendar valid').fill(bad);await save(page,'Calendar valid').click();await expect(requiredAlert(page,'Due date must be a valid YYYY-MM-DD date')).toBeVisible();
   await persistedDate(page,'Calendar validation','Calendar valid','2028-04-30');await page.reload();await expect(date(page,'Calendar valid')).toHaveValue('2028-04-30');
  }
 });
 test('032 date changes retain task identity filters order and all-task summary',async({page})=>{
  await createProject(page,'Calendar independence');await openProject(page,'Calendar independence');
  await createTask(page,'Dated first');await createTask(page,'Undated second');await createTask(page,'Completed normal guard');await page.getByRole('checkbox',{name:'Complete Completed normal guard',exact:true}).check();await expectPersistedCompletion(page,'Calendar independence','Completed normal guard',true);
  await taskRow(page,'Dated first').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Calendar independence','Dated first','High');
  await page.getByRole('checkbox',{name:'Complete Dated first',exact:true}).check();await expectPersistedCompletion(page,'Calendar independence','Dated first',true);
  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await expect(taskRow(page,'Undated second')).toHaveCount(0);await expect(taskRow(page,'Completed normal guard')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Completed normal guard')).toHaveCount(0);await expect(taskRow(page,'Dated first')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  await date(page,'Dated first').fill('2029-01-01');await save(page,'Dated first').click();await persistedDate(page,'Calendar independence','Dated first','2029-01-01');
  await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Completed');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  await expect(page.getByRole('checkbox',{name:'Complete Dated first',exact:true})).toBeChecked();await expect(taskRow(page,'Dated first').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');
  await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});
  await expect(date(page,'Undated second')).toHaveValue('');const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Dated first');expect(rows[1]).toContain('Undated second');
  await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Calendar independence').getByTestId('project-summary')).toHaveText('2/3 completed');
  await createProject(page,'Calendar second owner');await openProject(page,'Calendar second owner');await createTask(page,'Owner task');await expect(date(page,'Owner task')).toHaveValue('');
 });
 test('033 archived dates are read-only restored and old data stays undated',async({page})=>{
  await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  const prior=page.getByTestId('project-row').filter({hasText:'task-008 Persistence renamed'}).filter({visible:true});await prior.getByRole('button',{name:'Open project',exact:true}).click();
  await expect(date(page,'Memory kept')).toHaveValue('');await expect(page.getByRole('checkbox',{name:'Complete Memory kept',exact:true})).toBeChecked();await expect(taskRow(page,'Memory kept').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');
  await createProject(page,'Calendar archival');await openProject(page,'Calendar archival');await createTask(page,'Archive dated');
  await date(page,'Archive dated').fill('2030-12-31');await save(page,'Archive dated').click();await persistedDate(page,'Calendar archival','Archive dated','2030-12-31');
  await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Calendar archival').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Calendar archival')).toHaveCount(0);
  await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Calendar archival');await expect(date(page,'Archive dated')).toBeDisabled();await expect(save(page,'Archive dated')).toBeDisabled();await expect(date(page,'Archive dated')).toHaveValue('2030-12-31');
  await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Calendar archival').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Calendar archival');await expect(date(page,'Archive dated')).toBeEnabled();await expect(save(page,'Archive dated')).toBeEnabled();await expect(date(page,'Archive dated')).toHaveValue('2030-12-31');
 });
}
