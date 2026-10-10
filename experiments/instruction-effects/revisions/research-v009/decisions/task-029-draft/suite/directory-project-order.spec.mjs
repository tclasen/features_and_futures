import {test,expect} from '@playwright/test';
import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
const save=p=>p.getByRole('button',{name:'Set visible priority',exact:true});
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
if(stage>=28){
 test('091 project-name ordering folds ASCII keeps stable owner ties and reads current renames without changing storage',async({page})=>{
  test.setTimeout(90000);const a='Name order Zulu',b='Name order alpha',c='Name order ALPHA',q=projectName('Name order target'),az=q+' zulu stored',aa=q+' alpha stored',bz=q+' second zulu',ba=q+' second alpha',cz=q+' third';
  for(const [owner,titles] of [[a,[az,aa]],[b,[bz,ba]],[c,[cz]]]){await createProject(page,owner);await openProject(page,owner);for(const title of titles)await createTask(page,title);}
  await directory(page,q);await result(page,[a,b,c],['0/2 completed','0/2 completed','0/1 completed'],[az,aa,bz,ba,cz],'0/5 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Project name'});await result(page,[a,b,c],['0/2 completed','0/2 completed','0/1 completed'],[bz,ba,cz,az,aa],'0/5 completed');await expect(rows(page).getByTestId('directory-project-name')).toHaveText([b,b,c,a,a].map(projectName));
  await rows(page).last().getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[az,aa]);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project',exact:true}).click();const stream=await(await pending).createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);expect(JSON.parse(Buffer.concat(chunks).toString('utf8')).project.tasks.map(t=>t.title)).toEqual([az,aa]);
  const renamed='Name order Aardvark';await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(renamed));await page.getByRole('button',{name:'Rename project',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');return projectRow(observer,renamed).count();}).toBe(1);}finally{await observer.close();}
  await directory(page,q);await result(page,[renamed,b,c],['0/2 completed','0/2 completed','0/1 completed'],[az,aa,bz,ba,cz],'0/5 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Project name'});await result(page,[renamed,b,c],['0/2 completed','0/2 completed','0/1 completed'],[az,aa,bz,ba,cz],'0/5 completed');await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'High'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await result(page,[renamed,b,c],['0/2 completed','0/2 completed','0/1 completed'],[az,aa,bz,ba,cz],'0/5 completed');await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText('Project name');
 });
 test('092 project-name ordering compares Unicode code points and literal spacing across protected scope',async({page})=>{
  test.setTimeout(90000);const names=['Name Unicode å','Name Unicode Å','Name Unicode 🙂','Name Unicode \uE000','Name Unicode gap task','Name Unicode gap  task'],q=projectName('Name Unicode target'),tasks=names.map((_,i)=>q+' '+i);
  for(const [i,owner] of names.entries()){await createProject(page,owner);await openProject(page,owner);await configured(page,owner,tasks[i],{priority:'High',date:'2064-02-29',deleted:true});await page.goto('/');await projectRow(page,owner).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,owner)).toHaveCount(0);}
  await directory(page,q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,names,names.map(()=>'0/1 completed'),tasks,'0/6 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Project name'});await expect.poll(async()=>{try{return await rows(page).getByTestId('directory-task-title').allTextContents();}catch(e){if(e.message.includes('Execution context was destroyed'))return null;throw e;}}).toEqual([tasks[5],tasks[4],tasks[1],tasks[0],tasks[3],tasks[2]]);await expect(owners(page).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));await expect(page.getByRole('button',{name:'Set visible priority',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Delete visible tasks',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Restore visible tasks',exact:true})).toBeDisabled();await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Original'});await result(page,names,names.map(()=>'0/1 completed'),tasks,'0/6 completed');
 });
}
