# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owners.spec.mjs >> 076 directory owner totals track intersections bulk results and protected scopes in project creation order
- Location: experiments/instruction-effects/revisions/research-v006/decisions/task-023-draft/suite/directory-owners.spec.mjs:10:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary')
Timeout: 5000ms
- Expected  - 2
+ Received  + 2

  Array [
-   "1/2 completed",
-   "0/1 completed",
+   "1/3 completed",
+   "0/2 completed",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary') with timeout 5000ms
  - waiting for getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary')
    14 × locator resolved to 2 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f45e1]:
  - heading "Task directory" [level=1] [ref=f45e2]
  - text: 1/3 completed
  - generic [ref=f45e3]:
    - text: task-023 Owner totals zulu first1/3 completed
    - group [ref=f45e5]:
      - button "Open project" [ref=f45e6]
  - generic [ref=f45e7]:
    - text: task-023 Owner totals alpha second0/2 completed
    - group [ref=f45e9]:
      - button "Open project" [ref=f45e10]
  - group [ref=f45e12]:
    - button "Complete visible tasks" [ref=f45e13]
  - group [ref=f45e15]:
    - button "Reopen visible tasks" [ref=f45e16]
  - group [ref=f45e18]:
    - button "Projects" [ref=f45e19]
  - generic [ref=f45e21]:
    - text: Directory order
    - combobox "Directory order" [ref=f45e22]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
  - generic [ref=f45e24]:
    - text: Project scope
    - combobox "Project scope" [ref=f45e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f45e27]:
    - text: Task filter
    - combobox "Task filter" [ref=f45e28]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f45e30]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f45e31]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f45e33]:
    - generic [ref=f45e34]:
      - text: Directory search
      - textbox "Directory search" [ref=f45e35]: task-023 Owner totals record
    - button "Search directory" [ref=f45e36]
  - group [ref=f45e38]:
    - generic [ref=f45e39]:
      - text: Due from
      - textbox "Due from" [ref=f45e40]
    - generic [ref=f45e41]:
      - text: Due through
      - textbox "Due through" [ref=f45e42]
    - button "Apply due range" [ref=f45e43]
  - generic [ref=f45e44]:
    - text: task-023 Owner totals record zulu livetask-023 Owner totals zulu firstOpenNormal2060-01-01
    - group [ref=f45e46]:
      - button "Open project" [ref=f45e47]
  - generic [ref=f45e48]:
    - text: task-023 Owner totals record middle completedtask-023 Owner totals zulu firstCompletedHigh2060-02-01
    - group [ref=f45e50]:
      - button "Open project" [ref=f45e51]
  - generic [ref=f45e52]:
    - text: task-023 Owner totals record alpha livetask-023 Owner totals alpha secondOpenHigh2060-01-01
    - group [ref=f45e54]:
      - button "Open project" [ref=f45e55]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
  4  | const tasks=p=>p.getByTestId('directory-task-row').filter({visible:true});
  5  | async function directory(p,q){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
> 6  | async function result(p,names,counts,titles,total){if(!titles.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(tasks(p).getByTestId('directory-task-title')).toHaveText(titles);await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);await expect(p.getByTestId('directory-summary')).toHaveText(total);for(const row of await owners(p).all()){await expect(row.getByRole('button',{name:'Open project',exact:true})).toHaveCount(1);await expect(row.getByRole('textbox')).toHaveCount(0);await expect(row.getByRole('checkbox')).toHaveCount(0);}}
     |                                                                                                                                                                                                                                                                                                                                                                                            ^ Error: expect(locator).toHaveText(expected) failed
  7  | async function configured(p,owner,title,priority,date,complete=false,deleted=false){await createTask(p,title);if(priority!=='Normal'){await taskRow(p,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:priority});await expectPersistedPriority(p,owner,title,priority);}if(date){await taskRow(p,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(date);await taskRow(p,title).getByRole('button',{name:'Save due date',exact:true}).click();const observer=await p.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe(date);}finally{await observer.close();}}if(complete){await p.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await expectPersistedCompletion(p,owner,title,true);}if(deleted){await taskRow(p,title).getByRole('button',{name:'Delete task',exact:true}).click();const observer=await p.context().newPage();try{await observer.goto('/');await openProject(observer,owner);await observer.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(observer,title)).toBeVisible();}finally{await observer.close();}await p.goto('/');await openProject(p,owner);}}
  8  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  9  | if(stage>=23){
  10 |  test('076 directory owner totals track intersections bulk results and protected scopes in project creation order',async({page})=>{
  11 |   test.setTimeout(40000);const a='Owner totals zulu first',b='Owner totals alpha second',c='Owner totals archived',q=projectName('Owner totals record'),first=q+' zulu live',done=q+' middle completed',second=q+' alpha live',deleted=q+' first deleted',secondDeleted=q+' second deleted',archived=q+' archived live',archivedDeleted=q+' archived deleted';
  12 |   await createProject(page,a);await openProject(page,a);await configured(page,a,first,'Normal','2060-01-01');await configured(page,a,done,'High','2060-02-01',true);await configured(page,a,deleted,'High','2060-01-01',true,true);await createProject(page,b);await openProject(page,b);await configured(page,b,second,'High','2060-01-01');await configured(page,b,secondDeleted,'Low','2060-01-01',false,true);await createProject(page,c);await openProject(page,c);await configured(page,c,archived,'High','2060-01-01',true);await configured(page,c,archivedDeleted,'High','2060-01-01',true,true);await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  13 |   await directory(page,q);await result(page,[a,b],['1/2 completed','0/1 completed'],[first,done,second],'1/3 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['1/2 completed','0/1 completed'],[second,done,first],'1/3 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['1/1 completed','0/1 completed'],[second,done],'1/2 completed');await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2060-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2060-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[b],['0/1 completed'],[second],'0/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[b],['0/1 completed'],[second],'0/1 completed');await page.getByRole('button',{name:'Complete visible tasks',exact:true}).click();await expectPersistedCompletion(page,b,second,true);await result(page,[b],['1/1 completed'],[second],'1/1 completed');
  14 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});await result(page,[a,b],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');await page.getByRole('textbox',{name:'Due from',exact:true}).fill('');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['1/2 completed','1/1 completed'],[second,done,first],'2/3 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,b],['1/1 completed','0/1 completed'],[deleted,secondDeleted],'1/2 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[c],['1/1 completed'],[archivedDeleted],'1/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[c],['1/1 completed'],[archived],'1/1 completed');await owners(page).getByRole('button',{name:'Open project',exact:true}).click();await expect(taskRow(page,archived)).toBeVisible();await expect(taskRow(page,archivedDeleted)).toHaveCount(0);await expect(page.getByRole('checkbox',{name:'Complete '+archived,exact:true})).toBeDisabled();await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('All');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('All');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('');await page.goto('/');await expect(projectRow(page,a).getByTestId('project-summary')).toHaveText('1/2 completed');await expect(projectRow(page,b).getByTestId('project-summary')).toHaveText('1/1 completed');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,c).getByTestId('project-summary')).toHaveText('1/1 completed');
  15 |  });
  16 |  test('077 duplicate project names preserve separate owner identities and correct open actions after rename and create',async({page})=>{
  17 |   const a='Duplicate owner first',b='Duplicate owner second',q=projectName('Duplicate record'),first=q+' zulu first',second=q+' alpha second',third=q+' middle third';await createProject(page,a);await openProject(page,a);await createTask(page,first);await createProject(page,b);await openProject(page,b);await createTask(page,second);await page.getByRole('checkbox',{name:'Complete '+second,exact:true}).check();await expectPersistedCompletion(page,b,second,true);await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Rename project',exact:true}).click();const renamedObserver=await page.context().newPage();try{await expect.poll(async()=>{await renamedObserver.goto('/');return projectRow(renamedObserver,a).count();},{timeout:5000}).toBe(2);}finally{await renamedObserver.close();}await page.goto('/');await expect(projectRow(page,a)).toHaveCount(2);
  18 |   await directory(page,q);await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');await owners(page).nth(0).getByRole('button',{name:'Open project',exact:true}).click();await expect(taskRow(page,first)).toBeVisible();await expect(taskRow(page,second)).toHaveCount(0);await directory(page,q);await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await expect(taskRow(page,second)).toBeVisible();await expect(page.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeChecked();await expect(taskRow(page,first)).toHaveCount(0);
  19 |   await page.goto('/');await page.getByRole('textbox',{name:'Project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Create project',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');return projectRow(observer,a).count();},{timeout:5000}).toBe(3);}finally{await observer.close();}await page.goto('/');await expect(projectRow(page,a)).toHaveCount(3);await projectRow(page,a).nth(2).getByRole('button',{name:'Open project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName(a),exact:true}).first()).toBeVisible();await createTask(page,third);await directory(page,q);await result(page,[a,a,a],['0/1 completed','1/1 completed','0/1 completed'],[first,second,third],'1/3 completed');
  20 |  });
  21 | }
  22 | 
```