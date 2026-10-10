# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owners.spec.mjs >> 077 duplicate project names preserve separate owner identities and correct open actions after rename and create
- Location: experiments/instruction-effects/revisions/research-v009/preflight/priority-fixtures/final030-root-readiness02-executed-suite/directory-owners.spec.mjs:16:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-owner-row').visible().getByTestId('directory-owner-name')
Timeout: 5000ms
- Expected  - 1
+ Received  + 0

  Array [
    "task-030 Duplicate owner first",
-   "task-030 Duplicate owner first",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-owner-row').visible().getByTestId('directory-owner-name') with timeout 5000ms
  - waiting for getByTestId('directory-owner-row').visible().getByTestId('directory-owner-name')
    14 × locator resolved to 1 element

```

# Page snapshot

```yaml
- generic [active] [ref=f13e1]:
  - heading "Task directory" [level=1] [ref=f13e2]
  - text: 1/2 completed
  - generic [ref=f13e3]:
    - text: task-030 Duplicate owner first0/1 completed
    - group [ref=f13e5]:
      - button "Open project" [ref=f13e6]
  - group [ref=f13e8]:
    - button "Complete visible tasks" [ref=f13e9]
  - group [ref=f13e11]:
    - button "Reopen visible tasks" [ref=f13e12]
  - group [ref=f13e14]:
    - button "Delete visible tasks" [ref=f13e15]
  - group [ref=f13e17]:
    - button "Restore visible tasks" [disabled] [ref=f13e18]
  - group [ref=f13e20]:
    - generic [ref=f13e21]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f13e22]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f13e23]
  - group [ref=f13e25]:
    - generic [ref=f13e26]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f13e27]
    - button "Save visible due date" [ref=f13e28]
  - group [ref=f13e30]:
    - generic [ref=f13e31]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f13e32]
    - button "Save visible notes" [ref=f13e33]
  - group [ref=f13e35]:
    - button "Export matching workspace" [ref=f13e36]
  - group [ref=f13e38]:
    - button "Projects" [ref=f13e39]
  - generic [ref=f13e41]:
    - text: Directory order
    - combobox "Directory order" [ref=f13e42]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f13e44]:
    - text: Project scope
    - combobox "Project scope" [ref=f13e45]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f13e47]:
    - text: Task filter
    - combobox "Task filter" [ref=f13e48]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f13e50]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f13e51]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f13e53]:
    - generic [ref=f13e54]:
      - text: Directory search
      - textbox "Directory search" [ref=f13e55]: task-030 Duplicate record
    - button "Search directory" [ref=f13e56]
  - group [ref=f13e58]:
    - generic [ref=f13e59]:
      - text: Due from
      - textbox "Due from" [ref=f13e60]
    - generic [ref=f13e61]:
      - text: Due through
      - textbox "Due through" [ref=f13e62]
    - button "Apply due range" [ref=f13e63]
  - generic [ref=f13e64]:
    - text: task-030 Duplicate record zulu firsttask-030 Duplicate owner firstOpenNormal
    - group [ref=f13e66]:
      - button "Open project" [ref=f13e67]
  - generic [ref=f13e68]:
    - text: task-030 Duplicate record alpha secondtask-030 Duplicate owner firstCompletedNormal
    - group [ref=f13e70]:
      - button "Open project" [ref=f13e71]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
  4  | const tasks=p=>p.getByTestId('directory-task-row').filter({visible:true});
  5  | async function directory(p,q){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
> 6  | async function result(p,names,counts,titles,total){if(!titles.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(tasks(p).getByTestId('directory-task-title')).toHaveText(titles);await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);await expect(p.getByTestId('directory-summary')).toHaveText(total);for(const row of await owners(p).all()){await expect(row.getByRole('button',{name:'Open project',exact:true})).toHaveCount(1);await expect(row.getByRole('textbox')).toHaveCount(0);await expect(row.getByRole('checkbox')).toHaveCount(0);}}
     |                                                                                                                                                                                                                                                                                          ^ Error: expect(locator).toHaveText(expected) failed
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
  17 |   const a='Duplicate owner first',b='Duplicate owner second',q=projectName('Duplicate record'),first=q+' zulu first',second=q+' alpha second',third=q+' middle third';await createProject(page,a);await openProject(page,a);await createTask(page,first);await createProject(page,b);await openProject(page,b);await createTask(page,second);await page.getByRole('checkbox',{name:'Complete '+second,exact:true}).check();await expectPersistedCompletion(page,b,second,true);await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Rename project',exact:true}).click();const renamedObserver=await page.context().newPage();try{await expect.poll(async()=>{await renamedObserver.goto('/');await expect(projectRow(renamedObserver,a).first()).toBeVisible();return projectRow(renamedObserver,a).count();},{timeout:5000}).toBe(2);}finally{await renamedObserver.close();}await page.goto('/');await expect(projectRow(page,a)).toHaveCount(2);
  18 |   await directory(page,q);await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');await owners(page).nth(0).getByRole('button',{name:'Open project',exact:true}).click();await expect(taskRow(page,first)).toBeVisible();await expect(taskRow(page,second)).toHaveCount(0);await directory(page,q);await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await expect(taskRow(page,second)).toBeVisible();await expect(page.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeChecked();await expect(taskRow(page,first)).toHaveCount(0);
  19 |   await page.goto('/');await page.getByRole('textbox',{name:'Project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Create project',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await expect(projectRow(observer,a).first()).toBeVisible();return projectRow(observer,a).count();},{timeout:5000}).toBe(3);}finally{await observer.close();}await page.goto('/');await expect(projectRow(page,a)).toHaveCount(3);await projectRow(page,a).nth(2).getByRole('button',{name:'Open project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName(a),exact:true}).first()).toBeVisible();await createTask(page,third);await directory(page,q);await result(page,[a,a,a],['0/1 completed','1/1 completed','0/1 completed'],[first,second,third],'1/3 completed');
  20 |  });
  21 | }
  22 | 
```