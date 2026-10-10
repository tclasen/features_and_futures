import {test,expect} from '@playwright/test';
import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
const remove=p=>p.getByRole('button',{name:'Delete visible tasks',exact:true});
const restore=p=>p.getByRole('button',{name:'Restore visible tasks',exact:true});
async function titles(p,expected){const r=p.getByTestId('task-row').filter({visible:true});await expect(r).toHaveCount(expected.length);for(const [i,title] of expected.entries())await expect(r.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
async function result(p,names,counts,expected,total){
 if(!expected.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();
 await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
 await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));
 await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);
 await expect(p.getByTestId('directory-summary')).toHaveText(total);
}
async function directory(p,q){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
async function returnTo(p,owner){await p.goto('/');await openProject(p,owner);}
async function observed(p,owner,title,field,value){
 const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:field,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await o.close();}
 await returnTo(p,owner);
}
async function configured(p,owner,title,{priority='Normal',date='',completed=false,deleted=false,notes=''}={}){
 await createTask(p,title);
 if(priority!=='Normal'){await taskRow(p,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:priority});await expectPersistedPriority(p,owner,title,priority);await returnTo(p,owner);}
 if(date){await taskRow(p,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(date);await taskRow(p,title).getByRole('button',{name:'Save due date',exact:true}).click();await observed(p,owner,title,'Task due date',date);}
 if(notes){await taskRow(p,title).getByRole('textbox',{name:'Task notes',exact:true}).fill(notes);await taskRow(p,title).getByRole('button',{name:'Save notes',exact:true}).click();await observed(p,owner,title,'Task notes',notes);}
 if(completed){await p.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await expectPersistedCompletion(p,owner,title,true);await returnTo(p,owner);}
 if(deleted){await taskRow(p,title).getByRole('button',{name:'Delete task',exact:true}).click();const o=await p.context().newPage();try{await returnTo(o,owner);await o.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(o,title)).toBeVisible();}finally{await o.close();}await returnTo(p,owner);}
}
test.beforeEach(async({context})=>{await isolateBrowser(context);});
if(stage>=24){
 test('078 directory bulk deletion and restoration honor every intersection and protect live summaries before restoration',async({page})=>{
  test.setTimeout(90000);
  const a='Bulk delete first owner',b='Bulk delete second owner',c='Bulk delete archived owner',q=projectName('Batch record');
  const before=q+' before first',first=q+' selected target zulu',low=q+' priority guard',late=q+' date guard',done=q+' completion guard',other=projectName('Unrelated search guard'),old=q+' earlier deleted';
  const lowDeleted=q+' selected target priority protected',lateDeleted=q+' selected target date protected';
  const beforeB=q+' before second',second=q+' selected target alpha',afterB=q+' after second',protectedLive=q+' selected target archived live',protectedDeleted=q+' selected target archived deleted';
  const fields={priority:'High',date:'2064-02-29',notes:'Literal Ω\nretained  notes'};
  await createProject(page,a);await openProject(page,a);await configured(page,a,before);await configured(page,a,first,fields);await configured(page,a,low,{...fields,priority:'Low'});await configured(page,a,late,{...fields,date:'2064-03-01'});await configured(page,a,done,{...fields,completed:true});await configured(page,a,other,fields);await configured(page,a,old,{...fields,completed:true,deleted:true});await configured(page,a,lowDeleted,{...fields,priority:'Low',deleted:true});await configured(page,a,lateDeleted,{...fields,date:'2064-03-01',deleted:true});
  await createProject(page,b);await openProject(page,b);await configured(page,b,beforeB);await configured(page,b,second,fields);await configured(page,b,afterB);
  await createProject(page,c);await openProject(page,c);await configured(page,c,protectedLive,fields);await configured(page,c,protectedDeleted,{...fields,deleted:true});await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  await directory(page,q);await result(page,[a,b],['1/5 completed','0/3 completed'],[before,first,low,late,done,beforeB,second,afterB],'1/8 completed');
  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/4 completed','0/3 completed'],[before,first,low,late,beforeB,second,afterB],'0/7 completed');
  await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/2 completed','0/1 completed'],[first,late,second],'0/3 completed');
  await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2064-02-29');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2064-02-29');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[first,second],'0/2 completed');
  await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await expect(remove(page)).toBeEnabled();await expect(restore(page)).toBeDisabled();await remove(page).click();await result(page,[],[],[],'0/0 completed');await expect(remove(page)).toBeDisabled();await expect(restore(page)).toBeDisabled();await expect(page.getByRole('button',{name:'Complete visible tasks',exact:true})).toBeDisabled();
  // Observe live guards immediately; restoring later must not hide an over-broad deletion.
  const observer=await page.context().newPage();try{
   await returnTo(observer,a);await titles(observer,[before,low,late,done,other]);await expect(observer.getByRole('checkbox',{name:'Complete '+done,exact:true})).toBeChecked();await observer.goto('/');await expect(projectRow(observer,a).getByTestId('project-summary')).toHaveText('1/5 completed');await expect(projectRow(observer,b).getByTestId('project-summary')).toHaveText('0/2 completed');await returnTo(observer,b);await titles(observer,[beforeB,afterB]);
  }finally{await observer.close();}
  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,b],['1/2 completed','0/1 completed'],[old,second,first],'1/3 completed');await expect(remove(page)).toBeDisabled();await expect(restore(page)).toBeEnabled();
  await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(q+' selected target');await page.getByRole('button',{name:'Search directory',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await restore(page).click();await result(page,[],[],[],'0/0 completed');await expect(restore(page)).toBeDisabled();
  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[c],['0/1 completed'],[protectedLive],'0/1 completed');await expect(remove(page)).toBeDisabled();await expect(restore(page)).toBeDisabled();await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[c],['0/1 completed'],[protectedDeleted],'0/1 completed');await expect(remove(page)).toBeDisabled();await expect(restore(page)).toBeDisabled();
  await returnTo(page,a);await titles(page,[before,first,low,late,done,other]);await expect(page.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await expect(taskRow(page,first).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(fields.date);await expect(taskRow(page,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await titles(page,[old,lowDeleted,lateDeleted]);await returnTo(page,b);await titles(page,[beforeB,second,afterB]);await expect(taskRow(page,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);
 });
 test('079 bulk directory deletion preserves duplicate owner identities stored task order and completion on restoration',async({page})=>{
  test.setTimeout(60000);
  const a='Bulk duplicate owner',b='Bulk duplicate temporary',q=projectName('Duplicate bulk target'),first=q+' zulu first',second=q+' alpha second',beforeA='Duplicate before A',afterA='Duplicate after A',beforeB='Duplicate before B',afterB='Duplicate after B';
  await createProject(page,a);await openProject(page,a);await createTask(page,beforeA);await createTask(page,first);await createTask(page,afterA);await createProject(page,b);await openProject(page,b);await createTask(page,beforeB);await createTask(page,second);await page.getByRole('checkbox',{name:'Complete '+second,exact:true}).check();await expectPersistedCompletion(page,b,second,true);await returnTo(page,b);await createTask(page,afterB);
  await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Rename project',exact:true}).click();const o=await page.context().newPage();try{await expect.poll(async()=>{await o.goto('/');return projectRow(o,a).count();},{timeout:5000}).toBe(2);}finally{await o.close();}
  await directory(page,q);await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');await remove(page).click();await result(page,[],[],[],'0/0 completed');
  const live=await page.context().newPage();try{await live.goto('/');await expect(projectRow(live,a).getByTestId('project-summary')).toHaveText(['0/2 completed','0/2 completed']);}finally{await live.close();}
  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');await owners(page).nth(0).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeA,afterA]);
  await directory(page,q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeB,afterB]);
  await directory(page,q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await restore(page).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await owners(page).nth(0).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeA,first,afterA]);await expect(page.getByRole('checkbox',{name:'Complete '+first,exact:true})).not.toBeChecked();await directory(page,q);await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeB,second,afterB]);await expect(page.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeChecked();
 });
}
