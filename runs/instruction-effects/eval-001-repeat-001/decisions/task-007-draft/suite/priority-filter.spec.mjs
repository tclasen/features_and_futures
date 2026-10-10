import {test,expect} from '@playwright/test';
import {stage,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
const completion=page=>page.getByRole('combobox',{name:'Task filter',exact:true});
const filter=page=>page.getByRole('combobox',{name:'Priority filter',exact:true});
const priority=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true});
test.beforeEach(async({context})=>{await isolateBrowser(context);});
if(stage>=7) {
  test('023 priority and completion filters intersect in creation order',async({page})=>{
    await createProject(page,'Priority intersection');await openProject(page,'Priority intersection');
    await expect(filter(page).locator('option')).toHaveText(['All','Low','Normal','High']);
    await expect(filter(page).locator('option:checked')).toHaveText('All');
    for(const title of ['High open first','Low open','High completed','High open last'])await createTask(page,title);
    for(const title of ['High open first','High completed','High open last']) {
      await priority(page,title).selectOption({label:'High'});
      await expectPersistedPriority(page,'Priority intersection',title,'High');
    }
    await priority(page,'Low open').selectOption({label:'Low'});
    await expectPersistedPriority(page,'Priority intersection','Low open','Low');
    await page.getByRole('checkbox',{name:'Complete High completed',exact:true}).check();
    await expectPersistedCompletion(page,'Priority intersection','High completed',true);
    await filter(page).selectOption({label:'High'});
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);
    await completion(page).selectOption({label:'Open'});
    await expect(filter(page).locator('option:checked')).toHaveText('High');
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
    const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
    expect(rows[0]).toContain('High open first');expect(rows[1]).toContain('High open last');
    await completion(page).selectOption({label:'Completed'});
    await expect(taskRow(page,'High completed')).toBeVisible();
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
    await filter(page).selectOption({label:'Low'});
    await expect(completion(page).locator('option:checked')).toHaveText('Completed');
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
    await filter(page).selectOption({label:'All'});
    await expect(taskRow(page,'High completed')).toBeVisible();
    await completion(page).selectOption({label:'All'});
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);
    await page.getByRole('button',{name:'Projects',exact:true}).click();
    await expect(projectRow(page,'Priority intersection').getByTestId('project-summary')).toHaveText('1/4 completed');
  });

  test('024 filtered edits re-evaluate rows while retaining both filter choices',async({page})=>{
    await createProject(page,'Priority live filters');await openProject(page,'Priority live filters');
    await createTask(page,'Leaving priority');await createTask(page,'Leaving completion');
    for(const title of ['Leaving priority','Leaving completion']) {
      await priority(page,title).selectOption({label:'High'});
      await expectPersistedPriority(page,'Priority live filters',title,'High');
    }
    await completion(page).selectOption({label:'Open'});await filter(page).selectOption({label:'High'});
    await priority(page,'Leaving priority').selectOption({label:'Low'});
    await expectPersistedPriority(page,'Priority live filters','Leaving priority','Low');
    await expect(taskRow(page,'Leaving priority')).toHaveCount(0);
    await expect(filter(page).locator('option:checked')).toHaveText('High');
    await expect(completion(page).locator('option:checked')).toHaveText('Open');
    await page.getByRole('checkbox',{name:'Complete Leaving completion',exact:true}).check();
    await expectPersistedCompletion(page,'Priority live filters','Leaving completion',true);
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
    await expect(filter(page).locator('option:checked')).toHaveText('High');
    await expect(completion(page).locator('option:checked')).toHaveText('Open');
    await completion(page).selectOption({label:'Completed'});
    await expect(taskRow(page,'Leaving completion')).toBeVisible();
    await expect(priority(page,'Leaving completion').locator('option:checked')).toHaveText('High');
    await page.getByRole('checkbox',{name:'Complete Leaving completion',exact:true}).uncheck();
    await expectPersistedCompletion(page,'Priority live filters','Leaving completion',false);
    await expect(taskRow(page,'Leaving completion')).toHaveCount(0);
    await expect(completion(page).locator('option:checked')).toHaveText('Completed');
    await expect(filter(page).locator('option:checked')).toHaveText('High');
  });

  test('025 task rename retains combined filter membership',async({page})=>{
    await createProject(page,'Priority rename filters');await openProject(page,'Priority rename filters');
    await createTask(page,'Filtered old title');
    await priority(page,'Filtered old title').selectOption({label:'Low'});
    await expectPersistedPriority(page,'Priority rename filters','Filtered old title','Low');
    await filter(page).selectOption({label:'Low'});await completion(page).selectOption({label:'Open'});
    await taskRow(page,'Filtered old title').getByRole('textbox',{name:'New task title',exact:true}).fill('Filtered new title');
    await taskRow(page,'Filtered old title').getByRole('button',{name:'Rename task',exact:true}).click();
    await expectPersistedPriority(page,'Priority rename filters','Filtered new title','Low');
    await completion(page).selectOption({label:'Open'});await filter(page).selectOption({label:'Low'});
    await expect(page.getByRole('checkbox',{name:'Complete Filtered new title',exact:true})).not.toBeChecked();
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
    await filter(page).selectOption({label:'High'});
    await expect(taskRow(page,'Filtered new title')).toHaveCount(0);
  });

  test('026 archived combined filters are readable without enabling task editing',async({page})=>{
    await createProject(page,'Priority archived filters');await openProject(page,'Priority archived filters');
    await createTask(page,'Archived high open');await createTask(page,'Archived normal completed');
    await priority(page,'Archived high open').selectOption({label:'High'});
    await expectPersistedPriority(page,'Priority archived filters','Archived high open','High');
    await page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true}).check();
    await expectPersistedCompletion(page,'Priority archived filters','Archived normal completed',true);
    await page.getByRole('button',{name:'Projects',exact:true}).click();
    await projectRow(page,'Priority archived filters').getByRole('button',{name:'Archive project',exact:true}).click();
    await expect(projectRow(page,'Priority archived filters')).toHaveCount(0);
    await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
    await openProject(page,'Priority archived filters');
    await expect(filter(page)).toBeEnabled();await expect(completion(page)).toBeEnabled();
    await completion(page).selectOption({label:'Open'});await filter(page).selectOption({label:'High'});
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
    await expect(priority(page,'Archived high open')).toBeDisabled();
    await expect(page.getByRole('checkbox',{name:'Complete Archived high open',exact:true})).toBeDisabled();
    await expect(taskRow(page,'Archived high open').getByRole('textbox',{name:'New task title',exact:true})).toBeDisabled();
    await completion(page).selectOption({label:'Completed'});await filter(page).selectOption({label:'Normal'});
    await expect(page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true})).toBeChecked();
    await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
    await page.getByRole('button',{name:'Projects',exact:true}).click();
    await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
    await projectRow(page,'Priority archived filters').getByRole('button',{name:'Restore project',exact:true}).click();
    await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});
    await openProject(page,'Priority archived filters');
    await expect(filter(page).locator('option:checked')).toHaveText('All');
    await expect(priority(page,'Archived high open')).toBeEnabled();
    await expect(priority(page,'Archived high open').locator('option:checked')).toHaveText('High');
    await expect(page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true})).toBeChecked();
  });
}
