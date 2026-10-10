# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-summary.spec.mjs >> 074 directory totals follow global intersections bulk updates protected scopes and unchanged project summaries
- Location: experiments/instruction-effects/revisions/research-v005/decisions/task-022-draft/suite/directory-summary.spec.mjs:10:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('directory-summary')
Expected: "3/6 completed"
Received: "0/0 completed"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByTestId('directory-summary') with timeout 5000ms
  - waiting for getByTestId('directory-summary')
    14 × locator resolved to <span data-testid="directory-summary">0/0 completed</span>
       - unexpected value "0/0 completed"

```

```yaml
- text: 0/0 completed
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
  4  | const summary=p=>p.getByTestId('directory-summary');
  5  | async function directory(p,q){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
> 6  | async function result(p,value,titles){if(!titles.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(rows(p).getByTestId('directory-task-title')).toHaveText(titles);await expect(summary(p)).toHaveCount(1);await expect(summary(p)).toHaveText(value);}
     |                                                                                                                                                                                                                                                                                 ^ Error: expect(locator).toHaveText(expected) failed
  7  | async function configured(p,owner,title,priority,date='',completed=false,deleted=false){await createTask(p,title);if(priority!=='Normal'){await taskRow(p,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:priority});await expectPersistedPriority(p,owner,title,priority);}if(date){await taskRow(p,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(date);await taskRow(p,title).getByRole('button',{name:'Save due date',exact:true}).click();const observer=await p.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe(date);}finally{await observer.close();}}if(completed){await p.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await expectPersistedCompletion(p,owner,title,true);}if(deleted){await taskRow(p,title).getByRole('button',{name:'Delete task',exact:true}).click();const observer=await p.context().newPage();try{await observer.goto('/');await openProject(observer,owner);await observer.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(observer,title)).toBeVisible();}finally{await observer.close();}await p.goto('/');await openProject(p,owner);}}
  8  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  9  | if(stage>=22){
  10 |  test('074 directory totals follow global intersections bulk updates protected scopes and unchanged project summaries',async({page})=>{
  11 |   test.setTimeout(40000);const a='Summary first owner',b='Summary second owner',c='Summary archived owner',prefix=projectName('Summary record'),first=prefix+' zulu hit',done=prefix+' gamma done',low=prefix+' low live',other=prefix+' other done',second=prefix+' alpha hit',outside=prefix+' outside done',deleted=prefix+' completed deleted',deletedLow=prefix+' low deleted',deletedUndated=prefix+' undated deleted',archived=prefix+' archived live',archivedDeleted=prefix+' archived deleted';
  12 |   await createProject(page,a);await openProject(page,a);for(const [t,p,d,completed,gone] of [[first,'High','2056-01-01',false,false],[done,'High','2056-01-01',true,false],[low,'Low','',false,false],[other,'Normal','2056-02-01',true,false],[deleted,'High','2056-01-01',true,true],[deletedUndated,'Normal','',true,true]])await configured(page,a,t,p,d,completed,gone);await createProject(page,b);await openProject(page,b);for(const [t,p,d,completed,gone] of [[second,'High','2056-01-01',false,false],[outside,'High','2056-02-01',true,false],[deletedLow,'Low','2056-01-01',false,true]])await configured(page,b,t,p,d,completed,gone);await createProject(page,c);await openProject(page,c);await configured(page,c,archived,'High','2056-01-01',true);await configured(page,c,archivedDeleted,'High','2056-01-01',true,true);await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  13 |   await directory(page,'  '+prefix.toUpperCase()+'  ');await result(page,'3/6 completed',[first,done,low,other,second,outside]);await expect(summary(page).getByRole('textbox')).toHaveCount(0);await expect(summary(page).getByRole('button')).toHaveCount(0);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,'2/4 completed',[first,done,second,outside]);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2056-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2056-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,'1/3 completed',[first,done,second]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,'0/2 completed',[first,second]);await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,'0/2 completed',[second,first]);await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();for(const [owner,t] of [[a,first],[b,second]])await expectPersistedCompletion(page,owner,t,true);await result(page,'0/0 completed',[]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,'3/3 completed',[second,done,first]);await page.getByRole('button',{name:'Reopen visible tasks',exact:true}).click();for(const [owner,t] of [[a,first],[a,done],[b,second]])await expectPersistedCompletion(page,owner,t,false);await result(page,'0/0 completed',[]);
  14 |   await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,'1/1 completed',[archived]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,'1/1 completed',[archivedDeleted]);await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Active'});await result(page,'1/1 completed',[deleted]);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});await result(page,'1/2 completed',[deleted,deletedLow]);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,'2/3 completed',[deleted,deletedLow,deletedUndated]);
  15 |   await page.goto('/');await expect(projectRow(page,a).getByTestId('project-summary')).toHaveText('1/4 completed');await expect(projectRow(page,b).getByTestId('project-summary')).toHaveText('1/2 completed');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,c).getByTestId('project-summary')).toHaveText('1/1 completed');
  16 |  });
  17 |  test('075 directory totals show a resolved empty result without altering stored completion',async({page})=>{
  18 |   const owner='Summary empty owner',name=projectName('Summary empty record');await createProject(page,owner);await openProject(page,owner);await configured(page,owner,name,'High','2057-01-01',true);await directory(page,name);await result(page,'1/1 completed',[name]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,'0/0 completed',[]);await expect(page.getByRole('button',{name:'Complete visible tasks',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Reopen visible tasks',exact:true})).toBeDisabled();await expectPersistedCompletion(page,owner,name,true);
  19 |  });
  20 | }
  21 | 
```