import {test,expect} from '@playwright/test';
import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
const defaults=page=>page.getByRole('combobox',{name:'Default task priority',exact:true});
const priority=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true});
export async function persistedDefault(page,project,value) {
 const observer=await page.context().newPage();
 try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return defaults(observer).locator('option:checked').textContent();},{timeout:5000}).toBe(value);} finally {await observer.close();}
}
test.beforeEach(async({context})=>{await isolateBrowser(context);});
if(stage>=8) {
 test('027 pre-default projects and tasks preserve their distinct saved priorities',async({page})=>{
  await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  const prior=page.getByTestId('project-row').filter({hasText:'task-007 Persistence renamed'}).filter({visible:true});
  await expect(prior.getByTestId('project-summary')).toHaveText('1/1 completed');
  await prior.getByRole('button',{name:'Open project',exact:true}).click();
  await expect(defaults(page).locator('option:checked')).toHaveText('Normal');await expect(defaults(page)).toBeDisabled();
  await expect(priority(page,'Memory kept').locator('option:checked')).toHaveText('High');
  await expect(page.getByRole('checkbox',{name:'Complete Memory kept',exact:true})).toBeChecked();
 });
 test('028 project default affects only future tasks and retains filters and summary',async({page})=>{
  await createProject(page,'Defaults independent');
  await createProject(page,'Defaults inheritance');await openProject(page,'Defaults inheritance');
  await expect(defaults(page).locator('option')).toHaveText(['Low','Normal','High']);
  await expect(defaults(page).locator('option:checked')).toHaveText('Normal');
  await createTask(page,'Before default change');
  await page.getByRole('checkbox',{name:'Complete Before default change',exact:true}).check();
  await expectPersistedCompletion(page,'Defaults inheritance','Before default change',true);
  await defaults(page).selectOption({label:'High'});await persistedDefault(page,'Defaults inheritance','High');
  await createTask(page,'Inherited high');await expectPersistedPriority(page,'Defaults inheritance','Inherited high','High');
  await expect(priority(page,'Before default change').locator('option:checked')).toHaveText('Normal');
  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});
  await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});
  await defaults(page).selectOption({label:'Low'});await persistedDefault(page,'Defaults inheritance','Low');
  await persistedDefault(page,'Defaults independent','Normal');
  await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');
  await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  await expect(priority(page,'Inherited high').locator('option:checked')).toHaveText('High');
  await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});
  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});
  await createTask(page,'Inherited low');await expectPersistedPriority(page,'Defaults inheritance','Inherited low','Low');
  await defaults(page).selectOption({label:'Normal'});await persistedDefault(page,'Defaults inheritance','Normal');
  await createTask(page,'Inherited normal');await expectPersistedPriority(page,'Defaults inheritance','Inherited normal','Normal');
  await expect(priority(page,'Inherited high').locator('option:checked')).toHaveText('High');
  await expect(priority(page,'Inherited low').locator('option:checked')).toHaveText('Low');
  const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
  for(const [i,title] of ['Before default change','Inherited high','Inherited low','Inherited normal'].entries())expect(rows[i]).toContain(title);
  await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Defaults inheritance').getByTestId('project-summary')).toHaveText('1/4 completed');
  await page.goto('/');await openProject(page,'Defaults independent');
  await expect(defaults(page).locator('option:checked')).toHaveText('Normal');await createTask(page,'Independent normal');
  await expect(priority(page,'Independent normal').locator('option:checked')).toHaveText('Normal');
 });
 test('029 project default survives rename archive and restoration',async({page})=>{
  await createProject(page,'Defaults lifecycle');await openProject(page,'Defaults lifecycle');
  await defaults(page).selectOption({label:'Low'});await persistedDefault(page,'Defaults lifecycle','Low');
  await createTask(page,'Lifecycle task');await expectPersistedPriority(page,'Defaults lifecycle','Lifecycle task','Low');
  await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Defaults renamed'));
  await page.getByRole('button',{name:'Rename project',exact:true}).click();
  await expect(page.getByRole('heading',{name:projectName('Defaults renamed'),exact:true}).first()).toBeVisible();
  await persistedDefault(page,'Defaults renamed','Low');await page.reload();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Defaults renamed').getByRole('button',{name:'Archive project',exact:true}).click();
  await expect(projectRow(page,'Defaults renamed')).toHaveCount(0);
  await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Defaults renamed');
  await expect(defaults(page)).toBeDisabled();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  await projectRow(page,'Defaults renamed').getByRole('button',{name:'Restore project',exact:true}).click();
  await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Defaults renamed');
  await expect(defaults(page)).toBeEnabled();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  await expect(priority(page,'Lifecycle task').locator('option:checked')).toHaveText('Low');
  await createTask(page,'Restored inherits');await expectPersistedPriority(page,'Defaults renamed','Restored inherits','Low');
 });
}
