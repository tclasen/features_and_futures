# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: default-priority.spec.mjs >> 029 project default survives rename archive and restoration
- Location: runs/instruction-effects/eval-016/tasks/task-022/suite/default-priority.spec.mjs:53:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-022 Defaults renamed' }).visible().getByRole('button', { name: 'Open project', exact: true })

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
      - option "Active" [selected]
      - option "Archived"
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
    - button "Task directory" [ref=f1e404] [cursor=pointer]
    - generic [ref=f1e405]:
      - generic [ref=f1e406]: Project JSON
      - textbox "Project JSON" [ref=f1e407]
      - generic [ref=f1e408]: Imported project name
      - textbox "Imported project name" [ref=f1e409]
      - button "Import project" [ref=f1e410] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect } from '@playwright/test';
  2  | export const stage = Number(process.env.FF_STAGE);
  3  | export function projectName(name) {
  4  |   return (process.env.FF_FIXTURE_PREFIX ? process.env.FF_FIXTURE_PREFIX + ' ' : '') + name.trim();
  5  | }
  6  | export function projectRow(page, name) {
  7  |   return page.getByTestId('project-row').filter({ hasText: projectName(name) }).filter({ visible: true });
  8  | }
  9  | export function taskRow(page, title) {
  10 |   return page.getByTestId('task-row').filter({has:page.getByRole('checkbox',{name:'Complete '+title,exact:true})}).filter({visible:true});
  11 | }
  12 | export async function createProject(page, name) {
  13 |   await page.goto('/');
  14 |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name === name.trim() ? projectName(name) : '  ' + projectName(name) + '  ');
  15 |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  16 |   await expect(projectRow(page, name.trim())).toBeVisible();
  17 | }
  18 | export async function openProject(page, name) {
> 19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
     |                                                                                           ^ Error: locator.click: Test timeout of 20000ms exceeded.
  20 |   await expect(page.getByRole('heading', { name: projectName(name), exact: true }).first()).toBeVisible();
  21 | }
  22 | export async function createTask(page, title) {
  23 |   await page.getByRole('textbox', { name: 'Task title', exact: true }).fill(title);
  24 |   await page.getByRole('button', { name: 'Create task', exact: true }).click();
  25 |   await expect(taskRow(page, title.trim())).toBeVisible();
  26 |   await expect(taskRow(page, title.trim()).getByRole('checkbox', { name: 'Complete ' + title.trim(), exact: true })).toBeVisible();
  27 | }
  28 | export async function isolateBrowser(context) {
  29 |   await context.routeWebSocket('**/*', socket => socket.close());
  30 |   const origin = new URL(process.env.FF_BASE_URL).origin;
  31 |   await context.route('**/*', route => {
  32 |     const url = new URL(route.request().url());
  33 |     return url.origin === origin ? route.continue() : route.abort();
  34 |   });
  35 | }
  36 | 
  37 | export function requiredAlert(page, message) {
  38 |   return page.getByRole('alert').filter({ hasText: message }).filter({ visible: true }).first();
  39 | }
  40 | 
  41 | export async function assertDisclosedControls(page, checkpoint) {
  42 |   const deferred = [
  43 |     [2, 'Create task'], [3, 'Archive project'], [3, 'Restore project'],
  44 |     [4, 'Rename project'], [5, 'Rename task']
  45 |   ];
  46 |   for (const [introduced, name] of deferred) {
  47 |     if (checkpoint < introduced) {
  48 |       await expect(page.getByRole('button', {name, exact:true}).filter({visible:true})).toHaveCount(0);
  49 |     }
  50 |   }
  51 | }
  52 | 
  53 | export async function expectPersistedCompletion(page, project, title, completed) {
  54 |   const observer = await page.context().newPage();
  55 |   try {
  56 |     await expect.poll(async () => {
  57 |       await observer.goto('/');
  58 |       await openProject(observer, project);
  59 |       await observer.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'All'});
  60 |       await expect(taskRow(observer, title)).toBeVisible();
  61 |       return observer.getByRole('checkbox', {name:'Complete '+title, exact:true}).isChecked();
  62 |     }, {timeout:5000, message:'Completion state must be durable before the next navigation'}).toBe(completed);
  63 |   } finally { await observer.close(); }
  64 | }
  65 | 
  66 | export async function expectPersistedPriority(page, project, title, priority) {
  67 |   const observer = await page.context().newPage();
  68 |   try {
  69 |     await expect.poll(async () => {
  70 |       await observer.goto('/');
  71 |       await openProject(observer, project);
  72 |       await observer.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'All'});
  73 |       return taskRow(observer, title).getByRole('combobox', {name:'Task priority', exact:true}).locator('option:checked').textContent();
  74 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
  75 |   } finally { await observer.close(); }
  76 | }
  77 | 
```