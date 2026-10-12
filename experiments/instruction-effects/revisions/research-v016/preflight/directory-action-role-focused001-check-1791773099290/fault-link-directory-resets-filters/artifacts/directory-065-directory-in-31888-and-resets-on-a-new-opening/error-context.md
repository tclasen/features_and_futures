# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory.spec.mjs >> 065 directory intersects and retains filters validates ranges and resets on a new opening
- Location: experiments/instruction-effects/revisions/research-v016/preflight/task030-action-role-suite/directory.spec.mjs:17:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('directory-task-row').visible()
Expected: 4
Received: 12
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('directory-task-row').visible() with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible()
    14 × locator resolved to 12 elements
       - unexpected value "12"

```

# Page snapshot

```yaml
- generic [active] [ref=f29e1]:
  - heading "Task directory" [level=1] [ref=f29e2]
  - text: 1/12 completed
  - generic [ref=f29e3]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f29e5]:
      - button "Open project" [ref=f29e6]
  - generic [ref=f29e7]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f29e9]:
      - button "Open project" [ref=f29e10]
  - generic [ref=f29e11]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f29e13]:
      - button "Open project" [ref=f29e14]
  - generic [ref=f29e15]:
    - text: task-030 Directory filter owner1/5 completed
    - group [ref=f29e17]:
      - button "Open project" [ref=f29e18]
  - link "Complete visible tasks" [ref=f29e20] [cursor=pointer]:
    - /url: /directory/bulk-complete
  - link "Reopen visible tasks" [ref=f29e22] [cursor=pointer]:
    - /url: /directory/bulk-reopen
  - group [ref=f29e24]:
    - button "Delete visible tasks" [ref=f29e25]
  - group [ref=f29e27]:
    - button "Restore visible tasks" [disabled] [ref=f29e28]
  - group [ref=f29e30]:
    - generic [ref=f29e31]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f29e32]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f29e33]
  - group [ref=f29e35]:
    - generic [ref=f29e36]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f29e37]
    - button "Save visible due date" [ref=f29e38]
  - group [ref=f29e40]:
    - generic [ref=f29e41]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f29e42]
    - button "Save visible notes" [ref=f29e43]
  - link "Export matching workspace" [ref=f29e44] [cursor=pointer]:
    - /url: /directory/workspace-export?directory_order=Original&project_scope=Active&filter=All&priority_filter=All&due_from=&due_through=&directory_search=
  - group [ref=f29e46]:
    - button "Projects" [ref=f29e47]
  - generic [ref=f29e49]:
    - text: Directory order
    - combobox "Directory order" [ref=f29e50]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f29e52]:
    - text: Project scope
    - combobox "Project scope" [ref=f29e53]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f29e55]:
    - text: Task filter
    - combobox "Task filter" [ref=f29e56]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f29e58]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f29e59]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f29e60]:
    - generic [ref=f29e61]:
      - text: Directory search
      - textbox "Directory search" [ref=f29e62]
    - link "Search directory" [ref=f29e63] [cursor=pointer]:
      - /url: /directory/search
  - group [ref=f29e65]:
    - generic [ref=f29e66]:
      - text: Due from
      - textbox "Due from" [ref=f29e67]
    - generic [ref=f29e68]:
      - text: Due through
      - textbox "Due through" [ref=f29e69]
    - button "Apply due range" [ref=f29e70]
  - generic [ref=f29e71]:
    - text: First existingtask-012 Position first ownerOpenNormal
    - link "Open project" [ref=f29e73] [cursor=pointer]:
      - /url: /projects/13/open
  - generic [ref=f29e74]:
    - text: Position travellingtask-012 Position first ownerOpenNormal
    - link "Open project" [ref=f29e76] [cursor=pointer]:
      - /url: /projects/13/open
  - generic [ref=f29e77]:
    - text: First latertask-012 Position first ownerOpenNormal
    - link "Open project" [ref=f29e79] [cursor=pointer]:
      - /url: /projects/13/open
  - generic [ref=f29e80]:
    - text: First newly createdtask-012 Position first ownerOpenNormal
    - link "Open project" [ref=f29e82] [cursor=pointer]:
      - /url: /projects/13/open
  - generic [ref=f29e83]:
    - text: Second existingtask-012 Position second ownerOpenNormal
    - link "Open project" [ref=f29e85] [cursor=pointer]:
      - /url: /projects/18/open
  - generic [ref=f29e86]:
    - text: Second newly createdtask-012 Position second ownerOpenNormal
    - link "Open project" [ref=f29e88] [cursor=pointer]:
      - /url: /projects/18/open
  - generic [ref=f29e89]:
    - text: Imported livetask-018 Import restartOpenLow2044-02-29Live import
    - link "Open project" [ref=f29e91] [cursor=pointer]:
      - /url: /projects/35/open
  - generic [ref=f29e92]:
    - text: task-030 Filter hittask-030 Directory filter ownerOpenHigh2046-03-01
    - link "Open project" [ref=f29e94] [cursor=pointer]:
      - /url: /projects/1100/open
  - generic [ref=f29e95]:
    - text: task-030 Filter donetask-030 Directory filter ownerCompletedHigh2046-03-01
    - link "Open project" [ref=f29e97] [cursor=pointer]:
      - /url: /projects/1100/open
  - generic [ref=f29e98]:
    - text: task-030 Filter lowtask-030 Directory filter ownerOpenLow2046-03-01
    - link "Open project" [ref=f29e100] [cursor=pointer]:
      - /url: /projects/1100/open
  - generic [ref=f29e101]:
    - text: task-030 Filter undatedtask-030 Directory filter ownerOpenHigh
    - link "Open project" [ref=f29e103] [cursor=pointer]:
      - /url: /projects/1100/open
  - generic [ref=f29e104]:
    - text: task-030 Filter outsidetask-030 Directory filter ownerOpenHigh2046-04-01
    - link "Open project" [ref=f29e106] [cursor=pointer]:
      - /url: /projects/1100/open
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const title=text=>projectName(text);
  4  | const rows=page=>page.getByTestId('directory-task-row').filter({visible:true});
  5  | const row=(page,name)=>rows(page).filter({has:page.getByTestId('directory-task-title').filter({hasText:name})});
  6  | async function directory(page){await page.goto('/');await page.getByRole('button',{name:'Task directory',exact:true}).or(page.getByRole('link',{name:'Task directory',exact:true})).click();await expect(page.getByRole('combobox',{name:'Project scope',exact:true})).toBeVisible();}
  7  | async function query(page,text){await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(text);await page.getByRole('button',{name:'Search directory',exact:true}).or(page.getByRole('link',{name:'Search directory',exact:true})).click();}
  8  | async function saved(page,owner,name,label,value){await taskRow(page,name).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(page,name).getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);return taskRow(observer,name).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}}
  9  | async function taskWith(page,owner,name,priority='Normal',date='',completed=false,notes=''){await createTask(page,name);if(priority!=='Normal'){await taskRow(page,name).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:priority});await expectPersistedPriority(page,owner,name,priority);}if(date)await saved(page,owner,name,'Task due date',date);if(notes)await saved(page,owner,name,'Task notes',notes);if(completed){await page.getByRole('checkbox',{name:'Complete '+name,exact:true}).check();await expectPersistedCompletion(page,owner,name,true);}}
  10 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  11 | if(stage>=19){
  12 |  test('064 directory preserves owner and stored order with live deleted archived and literal field semantics',async({page})=>{
  13 |   const owner='Directory Zulu owner',first=title('Directory Zulu'),second=title('Directory Alpha'),third=title('Directory Mid'),deleted=title('Directory deleted'),archived=title('Directory archived'),note='  Directory <b>Ω</b>\nretained  ';await createProject(page,owner);await openProject(page,owner);await taskWith(page,owner,first,'High','2045-01-01',false,note);await taskWith(page,owner,second,'Low','',true);await taskWith(page,owner,deleted,'Normal','2047-01-01',true);await taskRow(page,deleted).getByRole('button',{name:'Delete task',exact:true}).click();await taskWith(page,owner,'Foreign directory title','Normal','',false,title('Directory notes only'));await createProject(page,'Directory Alpha owner');await openProject(page,'Directory Alpha owner');await createTask(page,third);await createProject(page,'Directory archived owner');await openProject(page,'Directory archived owner');await taskWith(page,'Directory archived owner',archived,'High','2045-01-01');await createTask(page,title('Directory archived deleted'));await taskRow(page,title('Directory archived deleted')).getByRole('button',{name:'Delete task',exact:true}).click();await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Directory archived owner').getByRole('button',{name:'Archive project',exact:true}).click();
  14 |   await directory(page);await expect(page.getByRole('combobox',{name:'Project scope',exact:true}).locator('option')).toHaveText(['Active','Archived']);await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option')).toHaveText(['All','Open','Completed','Deleted']);await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option')).toHaveText(['All','Low','Normal','High']);await query(page,'  '+title('Directory').toUpperCase()+'  ');await expect(row(page,first)).toBeVisible();await expect(rows(page)).toHaveCount(3);for(const [i,t] of [first,second,third].entries())await expect(rows(page).nth(i).getByTestId('directory-task-title')).toHaveText(t);await expect(row(page,first).getByTestId('directory-project-name')).toHaveText(projectName(owner));await expect(row(page,first).getByTestId('directory-task-completion')).toHaveText('Open');await expect(row(page,first).getByTestId('directory-task-priority')).toHaveText('High');await expect(row(page,first).getByTestId('directory-task-due-date')).toHaveText('2045-01-01');await expect.poll(async()=>(await row(page,first).getByTestId('directory-task-notes').textContent()).replace(/\r\n?/g,'\n')).toBe(note);await expect(row(page,second).getByTestId('directory-task-completion')).toHaveText('Completed');await expect(row(page,second).getByTestId('directory-task-priority')).toHaveText('Low');await expect(row(page,second).getByTestId('directory-task-due-date')).toHaveText('');await expect(rows(page).getByRole('textbox')).toHaveCount(0);
  15 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(row(page,deleted)).toBeVisible();await expect(rows(page)).toHaveCount(1);await expect(row(page,deleted).getByTestId('directory-task-completion')).toHaveText('Completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await expect(row(page,title('Directory archived deleted'))).toBeVisible();await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await expect(row(page,archived)).toBeVisible();await expect(rows(page)).toHaveCount(1);await row(page,archived).getByRole('button',{name:'Open project',exact:true}).or(row(page,archived).getByRole('link',{name:'Open project',exact:true})).click();await expect(page.getByRole('heading',{name:projectName('Directory archived owner'),exact:true}).first()).toBeVisible();await expect(taskRow(page,archived).getByRole('button',{name:'Delete task',exact:true})).toBeDisabled();
  16 |  });
  17 |  test('065 directory intersects and retains filters validates ranges and resets on a new opening',async({page})=>{
> 18 |   const owner='Directory filter owner';await createProject(page,owner);await openProject(page,owner);for(const [name,p,date,done] of [['Filter hit','High','2046-03-01',false],['Filter done','High','2046-03-01',true],['Filter low','Low','2046-03-01',false],['Filter undated','High','',false],['Filter outside','High','2046-04-01',false]])await taskWith(page,owner,title(name),p,date,done);await createProject(page,'Directory filter archive');await openProject(page,'Directory filter archive');await taskWith(page,'Directory filter archive',title('Filter archived'),'High','2046-03-01');await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Directory filter archive').getByRole('button',{name:'Archive project',exact:true}).click();await directory(page);await query(page,title('Filter'));await expect(row(page,title('Filter hit'))).toBeVisible();await expect(rows(page)).toHaveCount(5);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await expect(row(page,title('Filter hit'))).toBeVisible();await expect(rows(page)).toHaveCount(4);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(row(page,title('Filter hit'))).toBeVisible();await expect(rows(page)).toHaveCount(3);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2046-03-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2046-03-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(row(page,title('Filter hit'))).toBeVisible();await expect(rows(page)).toHaveCount(1);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2046-02-30');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Due range must use valid YYYY-MM-DD dates');await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(title('Filter'));await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(row(page,title('Filter hit'))).toBeVisible();await expect(rows(page)).toHaveCount(1);await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await expect(row(page,title('Filter archived'))).toBeVisible();await expect(rows(page)).toHaveCount(1);await row(page,title('Filter archived')).getByRole('button',{name:'Open project',exact:true}).or(row(page,title('Filter archived')).getByRole('link',{name:'Open project',exact:true})).click();await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('All');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('All');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('');await directory(page);await expect(page.getByRole('combobox',{name:'Project scope',exact:true}).locator('option:checked')).toHaveText('Active');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('All');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('All');await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue('');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('');
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           ^ Error: expect(locator).toHaveCount(expected) failed
  19 |  });
  20 |  test('066 directory includes original imported records and uses current whitespace matching without mutating project state',async({page})=>{
  21 |   await directory(page);await query(page,'IMPORTED LIVE');const legacy=rows(page).filter({has:page.getByTestId('directory-project-name').filter({hasText:'task-018 Import restart'})});await expect(legacy).toHaveCount(1);await expect(legacy.getByTestId('directory-task-title')).toHaveText('Imported live');await expect(legacy.getByTestId('directory-task-priority')).toHaveText('Low');await expect(legacy.getByTestId('directory-task-due-date')).toHaveText('2044-02-29');await expect(legacy.getByTestId('directory-task-notes')).toHaveText('Live import');await createProject(page,'Directory whitespace');await openProject(page,'Directory whitespace');await createTask(page,title('Gap  task'));await directory(page);await query(page,'  '+title('GAP\t TASK')+'  ');await expect(row(page,title('Gap  task'))).toBeVisible();await expect(rows(page)).toHaveCount(1);expect(await row(page,title('Gap  task')).getByTestId('directory-task-title').textContent()).toBe(title('Gap  task'));await row(page,title('Gap  task')).getByRole('button',{name:'Open project',exact:true}).or(row(page,title('Gap  task')).getByRole('link',{name:'Open project',exact:true})).click();await expect(taskRow(page,title('Gap  task'))).toBeVisible();await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Directory whitespace').getByTestId('project-summary')).toHaveText('0/1 completed');
  22 |  });
  23 | }
  24 | 
```