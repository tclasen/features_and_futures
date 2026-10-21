# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: due-date.spec.mjs >> 033 archived dates are read-only restored and old data stays undated
- Location: runs/instruction-effects/eval-016/tasks/task-022/suite/due-date.spec.mjs:44:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').filter({ hasText: 'task-022 Calendar archival' }).visible().getByRole('button', { name: 'Restore project', exact: true })
Expected: 0
Received: 1

Call log:
  - Expect "toHaveCount" getByTestId('project-row').filter({ hasText: 'task-022 Calendar archival' }).visible().getByRole('button', { name: 'Restore project', exact: true }) with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-022 Calendar archival' }).visible().getByRole('button', { name: 'Restore project', exact: true })
    10 × locator resolved to 1 element
       - unexpected value "1"
  - Test timeout of 20000ms exceeded.

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading [level=1] [ref=f1e4]:
    - link "Workboard" [ref=f1e5] [cursor=pointer]:
      - /url: /
  - region [ref=f1e6]:
    - heading "Projects" [level=2] [ref=f1e7]
    - generic [ref=f1e8]:
      - generic [ref=f1e9]: Project name
      - generic [ref=f1e10]:
        - textbox "Project name" [ref=f1e11]
        - button "Create project" [ref=f1e12] [cursor=pointer]
    - generic [ref=f1e13]: Project search
    - textbox "Project search" [ref=f1e14]
    - button "Search projects" [ref=f1e15] [cursor=pointer]
    - generic [ref=f1e16]: Project filter
    - combobox "Project filter" [ref=f1e17]:
      - option "Active"
      - option "Archived" [selected]
    - generic [ref=f1e18]:
      - generic [ref=f1e19]:
        - generic [ref=f1e20]: task-003 Persistence sentinel
        - generic [ref=f1e21]: 1/1 completed
        - button "Open project" [ref=f1e22] [cursor=pointer]
        - button "Restore project" [ref=f1e23] [cursor=pointer]
      - generic [ref=f1e24]:
        - generic [ref=f1e25]: task-004 Persistence renamed
        - generic [ref=f1e26]: 1/1 completed
        - button "Open project" [ref=f1e27] [cursor=pointer]
        - button "Restore project" [ref=f1e28] [cursor=pointer]
      - generic [ref=f1e29]:
        - generic [ref=f1e30]: task-005 Persistence renamed
        - generic [ref=f1e31]: 1/1 completed
        - button "Open project" [ref=f1e32] [cursor=pointer]
        - button "Restore project" [ref=f1e33] [cursor=pointer]
      - generic [ref=f1e34]:
        - generic [ref=f1e35]: task-006 Persistence renamed
        - generic [ref=f1e36]: 1/1 completed
        - button "Open project" [ref=f1e37] [cursor=pointer]
        - button "Restore project" [ref=f1e38] [cursor=pointer]
      - generic [ref=f1e39]:
        - generic [ref=f1e40]: task-007 Persistence renamed
        - generic [ref=f1e41]: 1/1 completed
        - button "Open project" [ref=f1e42] [cursor=pointer]
        - button "Restore project" [ref=f1e43] [cursor=pointer]
      - generic [ref=f1e44]:
        - generic [ref=f1e45]: task-008 Persistence renamed
        - generic [ref=f1e46]: 1/1 completed
        - button "Open project" [ref=f1e47] [cursor=pointer]
        - button "Restore project" [ref=f1e48] [cursor=pointer]
      - generic [ref=f1e49]:
        - generic [ref=f1e50]: task-009 Persistence renamed
        - generic [ref=f1e51]: 1/1 completed
        - button "Open project" [ref=f1e52] [cursor=pointer]
        - button "Restore project" [ref=f1e53] [cursor=pointer]
      - generic [ref=f1e54]:
        - generic [ref=f1e55]: task-010 Persistence renamed
        - generic [ref=f1e56]: 1/1 completed
        - button "Open project" [ref=f1e57] [cursor=pointer]
        - button "Restore project" [ref=f1e58] [cursor=pointer]
      - generic [ref=f1e59]:
        - generic [ref=f1e60]: task-011 Options hidden
        - generic [ref=f1e61]: 0/0 completed
        - button "Open project" [ref=f1e62] [cursor=pointer]
        - button "Restore project" [ref=f1e63] [cursor=pointer]
      - generic [ref=f1e64]:
        - generic [ref=f1e65]: task-011 Persistence renamed
        - generic [ref=f1e66]: 1/1 completed
        - button "Open project" [ref=f1e67] [cursor=pointer]
        - button "Restore project" [ref=f1e68] [cursor=pointer]
      - generic [ref=f1e69]:
        - generic [ref=f1e70]: task-012 Options hidden
        - generic [ref=f1e71]: 0/0 completed
        - button "Open project" [ref=f1e72] [cursor=pointer]
        - button "Restore project" [ref=f1e73] [cursor=pointer]
      - generic [ref=f1e74]:
        - generic [ref=f1e75]: task-012 Persistence renamed
        - generic [ref=f1e76]: 1/1 completed
        - button "Open project" [ref=f1e77] [cursor=pointer]
        - button "Restore project" [ref=f1e78] [cursor=pointer]
      - generic [ref=f1e79]:
        - generic [ref=f1e80]: task-013 Options hidden
        - generic [ref=f1e81]: 0/0 completed
        - button "Open project" [ref=f1e82] [cursor=pointer]
        - button "Restore project" [ref=f1e83] [cursor=pointer]
      - generic [ref=f1e84]:
        - generic [ref=f1e85]: task-013 Search MIXED archived
        - generic [ref=f1e86]: 0/0 completed
        - button "Open project" [ref=f1e87] [cursor=pointer]
        - button "Restore project" [ref=f1e88] [cursor=pointer]
      - generic [ref=f1e89]:
        - generic [ref=f1e90]: task-013 Search mutable titles
        - generic [ref=f1e91]: 0/3 completed
        - button "Open project" [ref=f1e92] [cursor=pointer]
        - button "Restore project" [ref=f1e93] [cursor=pointer]
      - generic [ref=f1e94]:
        - generic [ref=f1e95]: task-013 Persistence renamed
        - generic [ref=f1e96]: 1/1 completed
        - button "Open project" [ref=f1e97] [cursor=pointer]
        - button "Restore project" [ref=f1e98] [cursor=pointer]
      - generic [ref=f1e99]:
        - generic [ref=f1e100]: task-014 Options hidden
        - generic [ref=f1e101]: 0/0 completed
        - button "Open project" [ref=f1e102] [cursor=pointer]
        - button "Restore project" [ref=f1e103] [cursor=pointer]
      - generic [ref=f1e104]:
        - generic [ref=f1e105]: task-014 Whitespace Saved archived
        - generic [ref=f1e106]: 0/0 completed
        - button "Open project" [ref=f1e107] [cursor=pointer]
        - button "Restore project" [ref=f1e108] [cursor=pointer]
      - generic [ref=f1e109]:
        - generic [ref=f1e110]: task-014 Search MIXED archived
        - generic [ref=f1e111]: 0/0 completed
        - button "Open project" [ref=f1e112] [cursor=pointer]
        - button "Restore project" [ref=f1e113] [cursor=pointer]
      - generic [ref=f1e114]:
        - generic [ref=f1e115]: task-014 Search mutable titles
        - generic [ref=f1e116]: 0/3 completed
        - button "Open project" [ref=f1e117] [cursor=pointer]
        - button "Restore project" [ref=f1e118] [cursor=pointer]
      - generic [ref=f1e119]:
        - generic [ref=f1e120]: task-014 Persistence renamed
        - generic [ref=f1e121]: 1/1 completed
        - button "Open project" [ref=f1e122] [cursor=pointer]
        - button "Restore project" [ref=f1e123] [cursor=pointer]
      - generic [ref=f1e124]:
        - generic [ref=f1e125]: task-015 Options hidden
        - generic [ref=f1e126]: 0/0 completed
        - button "Open project" [ref=f1e127] [cursor=pointer]
        - button "Restore project" [ref=f1e128] [cursor=pointer]
      - generic [ref=f1e129]:
        - generic [ref=f1e130]: task-015 Whitespace Saved archived
        - generic [ref=f1e131]: 0/0 completed
        - button "Open project" [ref=f1e132] [cursor=pointer]
        - button "Restore project" [ref=f1e133] [cursor=pointer]
      - generic [ref=f1e134]:
        - generic [ref=f1e135]: task-015 Search MIXED archived
        - generic [ref=f1e136]: 0/0 completed
        - button "Open project" [ref=f1e137] [cursor=pointer]
        - button "Restore project" [ref=f1e138] [cursor=pointer]
      - generic [ref=f1e139]:
        - generic [ref=f1e140]: task-015 Search mutable titles
        - generic [ref=f1e141]: 0/3 completed
        - button "Open project" [ref=f1e142] [cursor=pointer]
        - button "Restore project" [ref=f1e143] [cursor=pointer]
      - generic [ref=f1e144]:
        - generic [ref=f1e145]: task-015 Persistence renamed
        - generic [ref=f1e146]: 1/1 completed
        - button "Open project" [ref=f1e147] [cursor=pointer]
        - button "Restore project" [ref=f1e148] [cursor=pointer]
      - generic [ref=f1e149]:
        - generic [ref=f1e150]: task-016 Options hidden
        - generic [ref=f1e151]: 0/0 completed
        - button "Open project" [ref=f1e152] [cursor=pointer]
        - button "Restore project" [ref=f1e153] [cursor=pointer]
      - generic [ref=f1e154]:
        - generic [ref=f1e155]: task-016 Whitespace Saved archived
        - generic [ref=f1e156]: 0/0 completed
        - button "Open project" [ref=f1e157] [cursor=pointer]
        - button "Restore project" [ref=f1e158] [cursor=pointer]
      - generic [ref=f1e159]:
        - generic [ref=f1e160]: task-016 Search MIXED archived
        - generic [ref=f1e161]: 0/0 completed
        - button "Open project" [ref=f1e162] [cursor=pointer]
        - button "Restore project" [ref=f1e163] [cursor=pointer]
      - generic [ref=f1e164]:
        - generic [ref=f1e165]: task-016 Search mutable titles
        - generic [ref=f1e166]: 0/3 completed
        - button "Open project" [ref=f1e167] [cursor=pointer]
        - button "Restore project" [ref=f1e168] [cursor=pointer]
      - generic [ref=f1e169]:
        - generic [ref=f1e170]: task-016 Persistence renamed
        - generic [ref=f1e171]: 1/1 completed
        - button "Open project" [ref=f1e172] [cursor=pointer]
        - button "Restore project" [ref=f1e173] [cursor=pointer]
      - generic [ref=f1e174]:
        - generic [ref=f1e175]: task-017 Options hidden
        - generic [ref=f1e176]: 0/0 completed
        - button "Open project" [ref=f1e177] [cursor=pointer]
        - button "Restore project" [ref=f1e178] [cursor=pointer]
      - generic [ref=f1e179]:
        - generic [ref=f1e180]: task-017 Whitespace Saved archived
        - generic [ref=f1e181]: 0/0 completed
        - button "Open project" [ref=f1e182] [cursor=pointer]
        - button "Restore project" [ref=f1e183] [cursor=pointer]
      - generic [ref=f1e184]:
        - generic [ref=f1e185]: task-017 Search MIXED archived
        - generic [ref=f1e186]: 0/0 completed
        - button "Open project" [ref=f1e187] [cursor=pointer]
        - button "Restore project" [ref=f1e188] [cursor=pointer]
      - generic [ref=f1e189]:
        - generic [ref=f1e190]: task-017 Search mutable titles
        - generic [ref=f1e191]: 0/3 completed
        - button "Open project" [ref=f1e192] [cursor=pointer]
        - button "Restore project" [ref=f1e193] [cursor=pointer]
      - generic [ref=f1e194]:
        - generic [ref=f1e195]: task-017 Persistence renamed
        - generic [ref=f1e196]: 1/1 completed
        - button "Open project" [ref=f1e197] [cursor=pointer]
        - button "Restore project" [ref=f1e198] [cursor=pointer]
      - generic [ref=f1e199]:
        - generic [ref=f1e200]: task-018 Parse guard archived
        - generic [ref=f1e201]: 0/0 completed
        - button "Open project" [ref=f1e202] [cursor=pointer]
        - button "Restore project" [ref=f1e203] [cursor=pointer]
      - generic [ref=f1e204]:
        - generic [ref=f1e205]: task-018 Task guard archived
        - generic [ref=f1e206]: 0/0 completed
        - button "Open project" [ref=f1e207] [cursor=pointer]
        - button "Restore project" [ref=f1e208] [cursor=pointer]
      - generic [ref=f1e209]:
        - generic [ref=f1e210]: task-018 Options hidden
        - generic [ref=f1e211]: 0/0 completed
        - button "Open project" [ref=f1e212] [cursor=pointer]
        - button "Restore project" [ref=f1e213] [cursor=pointer]
      - generic [ref=f1e214]:
        - generic [ref=f1e215]: task-018 Whitespace Saved archived
        - generic [ref=f1e216]: 0/0 completed
        - button "Open project" [ref=f1e217] [cursor=pointer]
        - button "Restore project" [ref=f1e218] [cursor=pointer]
      - generic [ref=f1e219]:
        - generic [ref=f1e220]: task-018 Search MIXED archived
        - generic [ref=f1e221]: 0/0 completed
        - button "Open project" [ref=f1e222] [cursor=pointer]
        - button "Restore project" [ref=f1e223] [cursor=pointer]
      - generic [ref=f1e224]:
        - generic [ref=f1e225]: task-018 Search mutable titles
        - generic [ref=f1e226]: 0/3 completed
        - button "Open project" [ref=f1e227] [cursor=pointer]
        - button "Restore project" [ref=f1e228] [cursor=pointer]
      - generic [ref=f1e229]:
        - generic [ref=f1e230]: task-018 Persistence renamed
        - generic [ref=f1e231]: 1/1 completed
        - button "Open project" [ref=f1e232] [cursor=pointer]
        - button "Restore project" [ref=f1e233] [cursor=pointer]
      - generic [ref=f1e234]:
        - generic [ref=f1e235]: task-019 Directory archived owner
        - generic [ref=f1e236]: 0/1 completed
        - button "Open project" [ref=f1e237] [cursor=pointer]
        - button "Restore project" [ref=f1e238] [cursor=pointer]
      - generic [ref=f1e239]:
        - generic [ref=f1e240]: task-019 Directory filter archive
        - generic [ref=f1e241]: 0/1 completed
        - button "Open project" [ref=f1e242] [cursor=pointer]
        - button "Restore project" [ref=f1e243] [cursor=pointer]
      - generic [ref=f1e244]:
        - generic [ref=f1e245]: task-019 Parse guard archived
        - generic [ref=f1e246]: 0/0 completed
        - button "Open project" [ref=f1e247] [cursor=pointer]
        - button "Restore project" [ref=f1e248] [cursor=pointer]
      - generic [ref=f1e249]:
        - generic [ref=f1e250]: task-019 Task guard archived
        - generic [ref=f1e251]: 0/0 completed
        - button "Open project" [ref=f1e252] [cursor=pointer]
        - button "Restore project" [ref=f1e253] [cursor=pointer]
      - generic [ref=f1e254]:
        - generic [ref=f1e255]: task-019 Options hidden
        - generic [ref=f1e256]: 0/0 completed
        - button "Open project" [ref=f1e257] [cursor=pointer]
        - button "Restore project" [ref=f1e258] [cursor=pointer]
      - generic [ref=f1e259]:
        - generic [ref=f1e260]: task-019 Whitespace Saved archived
        - generic [ref=f1e261]: 0/0 completed
        - button "Open project" [ref=f1e262] [cursor=pointer]
        - button "Restore project" [ref=f1e263] [cursor=pointer]
      - generic [ref=f1e264]:
        - generic [ref=f1e265]: task-019 Search MIXED archived
        - generic [ref=f1e266]: 0/0 completed
        - button "Open project" [ref=f1e267] [cursor=pointer]
        - button "Restore project" [ref=f1e268] [cursor=pointer]
      - generic [ref=f1e269]:
        - generic [ref=f1e270]: task-019 Search mutable titles
        - generic [ref=f1e271]: 0/3 completed
        - button "Open project" [ref=f1e272] [cursor=pointer]
        - button "Restore project" [ref=f1e273] [cursor=pointer]
      - generic [ref=f1e274]:
        - generic [ref=f1e275]: task-019 Persistence renamed
        - generic [ref=f1e276]: 1/1 completed
        - button "Open project" [ref=f1e277] [cursor=pointer]
        - button "Restore project" [ref=f1e278] [cursor=pointer]
      - generic [ref=f1e279]:
        - generic [ref=f1e280]: task-020 Bulk archived owner
        - generic [ref=f1e281]: 0/1 completed
        - button "Open project" [ref=f1e282] [cursor=pointer]
        - button "Restore project" [ref=f1e283] [cursor=pointer]
      - generic [ref=f1e284]:
        - generic [ref=f1e285]: task-020 Bulk protected archived
        - generic [ref=f1e286]: 1/1 completed
        - button "Open project" [ref=f1e287] [cursor=pointer]
        - button "Restore project" [ref=f1e288] [cursor=pointer]
      - generic [ref=f1e289]:
        - generic [ref=f1e290]: task-020 Directory archived owner
        - generic [ref=f1e291]: 0/1 completed
        - button "Open project" [ref=f1e292] [cursor=pointer]
        - button "Restore project" [ref=f1e293] [cursor=pointer]
      - generic [ref=f1e294]:
        - generic [ref=f1e295]: task-020 Directory filter archive
        - generic [ref=f1e296]: 0/1 completed
        - button "Open project" [ref=f1e297] [cursor=pointer]
        - button "Restore project" [ref=f1e298] [cursor=pointer]
      - generic [ref=f1e299]:
        - generic [ref=f1e300]: task-020 Parse guard archived
        - generic [ref=f1e301]: 0/0 completed
        - button "Open project" [ref=f1e302] [cursor=pointer]
        - button "Restore project" [ref=f1e303] [cursor=pointer]
      - generic [ref=f1e304]:
        - generic [ref=f1e305]: task-020 Task guard archived
        - generic [ref=f1e306]: 0/0 completed
        - button "Open project" [ref=f1e307] [cursor=pointer]
        - button "Restore project" [ref=f1e308] [cursor=pointer]
      - generic [ref=f1e309]:
        - generic [ref=f1e310]: task-020 Options hidden
        - generic [ref=f1e311]: 0/0 completed
        - button "Open project" [ref=f1e312] [cursor=pointer]
        - button "Restore project" [ref=f1e313] [cursor=pointer]
      - generic [ref=f1e314]:
        - generic [ref=f1e315]: task-020 Whitespace Saved archived
        - generic [ref=f1e316]: 0/0 completed
        - button "Open project" [ref=f1e317] [cursor=pointer]
        - button "Restore project" [ref=f1e318] [cursor=pointer]
      - generic [ref=f1e319]:
        - generic [ref=f1e320]: task-020 Search MIXED archived
        - generic [ref=f1e321]: 0/0 completed
        - button "Open project" [ref=f1e322] [cursor=pointer]
        - button "Restore project" [ref=f1e323] [cursor=pointer]
      - generic [ref=f1e324]:
        - generic [ref=f1e325]: task-020 Search mutable titles
        - generic [ref=f1e326]: 0/3 completed
        - button "Open project" [ref=f1e327] [cursor=pointer]
        - button "Restore project" [ref=f1e328] [cursor=pointer]
      - generic [ref=f1e329]:
        - generic [ref=f1e330]: task-020 Persistence renamed
        - generic [ref=f1e331]: 1/1 completed
        - button "Open project" [ref=f1e332] [cursor=pointer]
        - button "Restore project" [ref=f1e333] [cursor=pointer]
      - generic [ref=f1e334]:
        - generic [ref=f1e335]: task-021 Bulk archived owner
        - generic [ref=f1e336]: 0/1 completed
        - button "Open project" [ref=f1e337] [cursor=pointer]
        - button "Restore project" [ref=f1e338] [cursor=pointer]
      - generic [ref=f1e339]:
        - generic [ref=f1e340]: task-021 Bulk protected archived
        - generic [ref=f1e341]: 1/1 completed
        - button "Open project" [ref=f1e342] [cursor=pointer]
        - button "Restore project" [ref=f1e343] [cursor=pointer]
      - generic [ref=f1e344]:
        - generic [ref=f1e345]: task-021 Ordering archived first
        - generic [ref=f1e346]: 0/1 completed
        - button "Open project" [ref=f1e347] [cursor=pointer]
        - button "Restore project" [ref=f1e348] [cursor=pointer]
      - generic [ref=f1e349]:
        - generic [ref=f1e350]: task-021 Ordering archived second
        - generic [ref=f1e351]: 0/0 completed
        - button "Open project" [ref=f1e352] [cursor=pointer]
        - button "Restore project" [ref=f1e353] [cursor=pointer]
      - generic [ref=f1e354]:
        - generic [ref=f1e355]: task-021 Ordering archived third
        - generic [ref=f1e356]: 0/0 completed
        - button "Open project" [ref=f1e357] [cursor=pointer]
        - button "Restore project" [ref=f1e358] [cursor=pointer]
      - generic [ref=f1e359]:
        - generic [ref=f1e360]: task-021 Directory archived owner
        - generic [ref=f1e361]: 0/1 completed
        - button "Open project" [ref=f1e362] [cursor=pointer]
        - button "Restore project" [ref=f1e363] [cursor=pointer]
      - generic [ref=f1e364]:
        - generic [ref=f1e365]: task-021 Directory filter archive
        - generic [ref=f1e366]: 0/1 completed
        - button "Open project" [ref=f1e367] [cursor=pointer]
        - button "Restore project" [ref=f1e368] [cursor=pointer]
      - generic [ref=f1e369]:
        - generic [ref=f1e370]: task-021 Parse guard archived
        - generic [ref=f1e371]: 0/0 completed
        - button "Open project" [ref=f1e372] [cursor=pointer]
        - button "Restore project" [ref=f1e373] [cursor=pointer]
      - generic [ref=f1e374]:
        - generic [ref=f1e375]: task-021 Task guard archived
        - generic [ref=f1e376]: 0/0 completed
        - button "Open project" [ref=f1e377] [cursor=pointer]
        - button "Restore project" [ref=f1e378] [cursor=pointer]
      - generic [ref=f1e379]:
        - generic [ref=f1e380]: task-021 Options hidden
        - generic [ref=f1e381]: 0/0 completed
        - button "Open project" [ref=f1e382] [cursor=pointer]
        - button "Restore project" [ref=f1e383] [cursor=pointer]
      - generic [ref=f1e384]:
        - generic [ref=f1e385]: task-021 Whitespace Saved archived
        - generic [ref=f1e386]: 0/0 completed
        - button "Open project" [ref=f1e387] [cursor=pointer]
        - button "Restore project" [ref=f1e388] [cursor=pointer]
      - generic [ref=f1e389]:
        - generic [ref=f1e390]: task-021 Search MIXED archived
        - generic [ref=f1e391]: 0/0 completed
        - button "Open project" [ref=f1e392] [cursor=pointer]
        - button "Restore project" [ref=f1e393] [cursor=pointer]
      - generic [ref=f1e394]:
        - generic [ref=f1e395]: task-021 Search mutable titles
        - generic [ref=f1e396]: 0/3 completed
        - button "Open project" [ref=f1e397] [cursor=pointer]
        - button "Restore project" [ref=f1e398] [cursor=pointer]
      - generic [ref=f1e399]:
        - generic [ref=f1e400]: task-021 Persistence renamed
        - generic [ref=f1e401]: 1/1 completed
        - button "Open project" [ref=f1e402] [cursor=pointer]
        - button "Restore project" [ref=f1e403] [cursor=pointer]
      - generic [ref=f1e404]:
        - generic [ref=f1e405]: task-022 Calendar archival
        - generic [ref=f1e406]: 0/1 completed
        - button "Open project" [ref=f1e407] [cursor=pointer]
        - button "Restore project" [ref=f1e408] [cursor=pointer]
    - button "Task directory" [ref=f1e409] [cursor=pointer]
    - generic [ref=f1e410]:
      - generic [ref=f1e411]: Project JSON
      - textbox "Project JSON" [ref=f1e412]
      - generic [ref=f1e413]: Imported project name
      - textbox "Imported project name" [ref=f1e414]
      - button "Import project" [ref=f1e415] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority,requiredAlert} from './helpers.mjs';
  3  | const date=(page,title)=>taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true});
  4  | const save=(page,title)=>taskRow(page,title).getByRole('button',{name:'Save due date',exact:true});
  5  | async function persistedDate(page,project,title,value) {
  6  |  const observer=await page.context().newPage();
  7  |  try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return date(observer,title).inputValue();},{timeout:5000}).toBe(value);} finally {await observer.close();}
  8  | }
  9  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  10 | if(stage>=9) {
  11 |  test('030 dates default empty save canonically survive rename and clear',async({page})=>{
  12 |   await createProject(page,'Calendar persistence');await openProject(page,'Calendar persistence');await createTask(page,'Calendar old title');
  13 |   await expect(date(page,'Calendar old title')).toHaveValue('');
  14 |   await date(page,'Calendar old title').fill(' 2028-02-29 ');await save(page,'Calendar old title').click();
  15 |   await persistedDate(page,'Calendar persistence','Calendar old title','2028-02-29');await page.reload();await expect(date(page,'Calendar old title')).toHaveValue('2028-02-29');
  16 |   await taskRow(page,'Calendar old title').getByRole('textbox',{name:'New task title',exact:true}).fill('Calendar renamed');
  17 |   await taskRow(page,'Calendar old title').getByRole('button',{name:'Rename task',exact:true}).click();
  18 |   await expect(date(page,'Calendar renamed')).toBeVisible();await persistedDate(page,'Calendar persistence','Calendar renamed','2028-02-29');
  19 |   await date(page,'Calendar renamed').fill('   ');await save(page,'Calendar renamed').click();await persistedDate(page,'Calendar persistence','Calendar renamed','');await page.reload();await expect(date(page,'Calendar renamed')).toHaveValue('');
  20 |  });
  21 |  test('031 invalid formats and impossible calendar dates preserve the saved date',async({page})=>{
  22 |   await createProject(page,'Calendar validation');await openProject(page,'Calendar validation');await createTask(page,'Calendar valid');
  23 |   await date(page,'Calendar valid').fill('2028-04-30');await save(page,'Calendar valid').click();await persistedDate(page,'Calendar validation','Calendar valid','2028-04-30');
  24 |   for(const bad of ['2027-02-29','2028-04-31','2028-13-01','2028-00-10','0000-01-01','28-01-01','2028-1-01','not a date']) {
  25 |    await date(page,'Calendar valid').fill(bad);await save(page,'Calendar valid').click();await expect(requiredAlert(page,'Due date must be a valid YYYY-MM-DD date')).toBeVisible();
  26 |    await persistedDate(page,'Calendar validation','Calendar valid','2028-04-30');await page.reload();await expect(date(page,'Calendar valid')).toHaveValue('2028-04-30');
  27 |   }
  28 |  });
  29 |  test('032 date changes retain task identity filters order and all-task summary',async({page})=>{
  30 |   await createProject(page,'Calendar independence');await openProject(page,'Calendar independence');
  31 |   await createTask(page,'Dated first');await createTask(page,'Undated second');await createTask(page,'Completed normal guard');await page.getByRole('checkbox',{name:'Complete Completed normal guard',exact:true}).check();await expectPersistedCompletion(page,'Calendar independence','Completed normal guard',true);
  32 |   await taskRow(page,'Dated first').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Calendar independence','Dated first','High');
  33 |   await page.getByRole('checkbox',{name:'Complete Dated first',exact:true}).check();await expectPersistedCompletion(page,'Calendar independence','Dated first',true);
  34 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await expect(taskRow(page,'Undated second')).toHaveCount(0);await expect(taskRow(page,'Completed normal guard')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Completed normal guard')).toHaveCount(0);await expect(taskRow(page,'Dated first')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  35 |   await date(page,'Dated first').fill('2029-01-01');await save(page,'Dated first').click();await persistedDate(page,'Calendar independence','Dated first','2029-01-01');
  36 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Completed');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  37 |   await expect(page.getByRole('checkbox',{name:'Complete Dated first',exact:true})).toBeChecked();await expect(taskRow(page,'Dated first').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');
  38 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  39 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});
  40 |   await expect(date(page,'Undated second')).toHaveValue('');const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Dated first');expect(rows[1]).toContain('Undated second');
  41 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Calendar independence').getByTestId('project-summary')).toHaveText('2/3 completed');
  42 |   await createProject(page,'Calendar second owner');await openProject(page,'Calendar second owner');await createTask(page,'Owner task');await expect(date(page,'Owner task')).toHaveValue('');
  43 |  });
  44 |  test('033 archived dates are read-only restored and old data stays undated',async({page})=>{
  45 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  46 |   const prior=page.getByTestId('project-row').filter({hasText:'task-008 Persistence renamed'}).filter({visible:true});await prior.getByRole('button',{name:'Open project',exact:true}).click();
  47 |   await expect(date(page,'Memory kept')).toHaveValue('');await expect(page.getByRole('checkbox',{name:'Complete Memory kept',exact:true})).toBeChecked();await expect(taskRow(page,'Memory kept').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');
  48 |   await createProject(page,'Calendar archival');await openProject(page,'Calendar archival');await createTask(page,'Archive dated');
  49 |   await date(page,'Archive dated').fill('2030-12-31');await save(page,'Archive dated').click();await persistedDate(page,'Calendar archival','Archive dated','2030-12-31');
  50 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Calendar archival').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Calendar archival')).toHaveCount(0);
  51 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Calendar archival');await expect(date(page,'Archive dated')).toBeDisabled();await expect(save(page,'Archive dated')).toBeDisabled();await expect(date(page,'Archive dated')).toHaveValue('2030-12-31');
> 52 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Calendar archival').getByRole('button',{name:'Restore project',exact:true}).click();await expect(projectRow(page,'Calendar archival').getByRole('button',{name:'Restore project',exact:true})).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Calendar archival');await expect(date(page,'Archive dated')).toBeEnabled();await expect(save(page,'Archive dated')).toBeEnabled();await expect(date(page,'Archive dated')).toHaveValue('2030-12-31');
     |                                                                                                                                                                                                                                                                                                                                                                                                  ^ Error: expect(locator).toHaveCount(expected) failed
  53 |  });
  54 | }
  55 | 
```