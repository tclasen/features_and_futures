# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/pilot-011/definitions/project/acceptance/workboard.spec.mjs:108:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button type="button">Open project</button> aka locator('div:nth-child(26) > .project-actions > button').first()
    2) <button type="button">Open project</button> aka locator('div:nth-child(52) > .project-actions > button').first()

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=f4e2]:
  - heading "Workboard" [level=1] [ref=f4e3]
  - alert [ref=f4e4]
  - generic [ref=f4e5]:
    - generic [ref=f4e6]: Project filter
    - combobox "Project filter" [ref=f4e7]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f4e8]:
    - generic [ref=f4e9]: Project name
    - textbox "Project name" [ref=f4e10]
    - button "Create project" [ref=f4e11] [cursor=pointer]
  - region "Projects" [ref=f4e12]:
    - generic [ref=f4e13]:
      - generic "Rename project" [ref=f4e14]: task-001 Alpha create
      - generic [ref=f4e15]: 0/0 completed
      - generic [ref=f4e16]:
        - button "Open project" [ref=f4e17] [cursor=pointer]
        - button "Archive project" [ref=f4e18] [cursor=pointer]
    - generic [ref=f4e19]:
      - generic "Rename project" [ref=f4e20]: task-001 Blank validation sentinel
      - generic [ref=f4e21]: 0/0 completed
      - generic [ref=f4e22]:
        - button "Open project" [ref=f4e23] [cursor=pointer]
        - button "Archive project" [ref=f4e24] [cursor=pointer]
    - generic [ref=f4e25]:
      - generic "Rename project" [ref=f4e26]: task-001 Order first
      - generic [ref=f4e27]: 0/0 completed
      - generic [ref=f4e28]:
        - button "Open project" [ref=f4e29] [cursor=pointer]
        - button "Archive project" [ref=f4e30] [cursor=pointer]
    - generic [ref=f4e31]:
      - generic "Rename project" [ref=f4e32]: task-001 Order second
      - generic [ref=f4e33]: 0/0 completed
      - generic [ref=f4e34]:
        - button "Open project" [ref=f4e35] [cursor=pointer]
        - button "Archive project" [ref=f4e36] [cursor=pointer]
    - generic [ref=f4e37]:
      - generic "Rename project" [ref=f4e38]: task-001 Persistence sentinel
      - generic [ref=f4e39]: 0/0 completed
      - generic [ref=f4e40]:
        - button "Open project" [ref=f4e41] [cursor=pointer]
        - button "Archive project" [ref=f4e42] [cursor=pointer]
    - generic [ref=f4e43]:
      - generic "Rename project" [ref=f4e44]: task-002 Alpha create
      - generic [ref=f4e45]: 0/0 completed
      - generic [ref=f4e46]:
        - button "Open project" [ref=f4e47] [cursor=pointer]
        - button "Archive project" [ref=f4e48] [cursor=pointer]
    - generic [ref=f4e49]:
      - generic "Rename project" [ref=f4e50]: task-002 Blank validation sentinel
      - generic [ref=f4e51]: 0/0 completed
      - generic [ref=f4e52]:
        - button "Open project" [ref=f4e53] [cursor=pointer]
        - button "Archive project" [ref=f4e54] [cursor=pointer]
    - generic [ref=f4e55]:
      - generic "Rename project" [ref=f4e56]: task-002 Order first
      - generic [ref=f4e57]: 0/0 completed
      - generic [ref=f4e58]:
        - button "Open project" [ref=f4e59] [cursor=pointer]
        - button "Archive project" [ref=f4e60] [cursor=pointer]
    - generic [ref=f4e61]:
      - generic "Rename project" [ref=f4e62]: task-002 Order second
      - generic [ref=f4e63]: 0/0 completed
      - generic [ref=f4e64]:
        - button "Open project" [ref=f4e65] [cursor=pointer]
        - button "Archive project" [ref=f4e66] [cursor=pointer]
    - generic [ref=f4e67]:
      - generic "Rename project" [ref=f4e68]: task-002 Task reload
      - generic [ref=f4e69]: 0/1 completed
      - generic [ref=f4e70]:
        - button "Open project" [ref=f4e71] [cursor=pointer]
        - button "Archive project" [ref=f4e72] [cursor=pointer]
    - generic [ref=f4e73]:
      - generic "Rename project" [ref=f4e74]: task-002 Task invalid
      - generic [ref=f4e75]: 0/0 completed
      - generic [ref=f4e76]:
        - button "Open project" [ref=f4e77] [cursor=pointer]
        - button "Archive project" [ref=f4e78] [cursor=pointer]
    - generic [ref=f4e79]:
      - generic "Rename project" [ref=f4e80]: task-002 Task owner
      - generic [ref=f4e81]: 0/1 completed
      - generic [ref=f4e82]:
        - button "Open project" [ref=f4e83] [cursor=pointer]
        - button "Archive project" [ref=f4e84] [cursor=pointer]
    - generic [ref=f4e85]:
      - generic "Rename project" [ref=f4e86]: task-002 Other project
      - generic [ref=f4e87]: 0/0 completed
      - generic [ref=f4e88]:
        - button "Open project" [ref=f4e89] [cursor=pointer]
        - button "Archive project" [ref=f4e90] [cursor=pointer]
    - generic [ref=f4e91]:
      - generic "Rename project" [ref=f4e92]: task-002 Task filters
      - generic [ref=f4e93]: 0/2 completed
      - generic [ref=f4e94]:
        - button "Open project" [ref=f4e95] [cursor=pointer]
        - button "Archive project" [ref=f4e96] [cursor=pointer]
    - generic [ref=f4e97]:
      - generic "Rename project" [ref=f4e98]: task-002 Persistence sentinel
      - generic [ref=f4e99]: 1/1 completed
      - generic [ref=f4e100]:
        - button "Open project" [ref=f4e101] [cursor=pointer]
        - button "Archive project" [ref=f4e102] [cursor=pointer]
    - generic [ref=f4e103]:
      - generic "Rename project" [ref=f4e104]: task-003 Alpha create
      - generic [ref=f4e105]: 0/0 completed
      - generic [ref=f4e106]:
        - button "Open project" [ref=f4e107] [cursor=pointer]
        - button "Archive project" [ref=f4e108] [cursor=pointer]
    - generic [ref=f4e109]:
      - generic "Rename project" [ref=f4e110]: task-003 Blank validation sentinel
      - generic [ref=f4e111]: 0/0 completed
      - generic [ref=f4e112]:
        - button "Open project" [ref=f4e113] [cursor=pointer]
        - button "Archive project" [ref=f4e114] [cursor=pointer]
    - generic [ref=f4e115]:
      - generic "Rename project" [ref=f4e116]: task-003 Order first
      - generic [ref=f4e117]: 0/0 completed
      - generic [ref=f4e118]:
        - button "Open project" [ref=f4e119] [cursor=pointer]
        - button "Archive project" [ref=f4e120] [cursor=pointer]
    - generic [ref=f4e121]:
      - generic "Rename project" [ref=f4e122]: task-003 Order second
      - generic [ref=f4e123]: 0/0 completed
      - generic [ref=f4e124]:
        - button "Open project" [ref=f4e125] [cursor=pointer]
        - button "Archive project" [ref=f4e126] [cursor=pointer]
    - generic [ref=f4e127]:
      - generic "Rename project" [ref=f4e128]: task-003 Task reload
      - generic [ref=f4e129]: 0/1 completed
      - generic [ref=f4e130]:
        - button "Open project" [ref=f4e131] [cursor=pointer]
        - button "Archive project" [ref=f4e132] [cursor=pointer]
    - generic [ref=f4e133]:
      - generic "Rename project" [ref=f4e134]: task-003 Task invalid
      - generic [ref=f4e135]: 0/0 completed
      - generic [ref=f4e136]:
        - button "Open project" [ref=f4e137] [cursor=pointer]
        - button "Archive project" [ref=f4e138] [cursor=pointer]
    - generic [ref=f4e139]:
      - generic "Rename project" [ref=f4e140]: task-003 Task owner
      - generic [ref=f4e141]: 0/1 completed
      - generic [ref=f4e142]:
        - button "Open project" [ref=f4e143] [cursor=pointer]
        - button "Archive project" [ref=f4e144] [cursor=pointer]
    - generic [ref=f4e145]:
      - generic "Rename project" [ref=f4e146]: task-003 Other project
      - generic [ref=f4e147]: 0/0 completed
      - generic [ref=f4e148]:
        - button "Open project" [ref=f4e149] [cursor=pointer]
        - button "Archive project" [ref=f4e150] [cursor=pointer]
    - generic [ref=f4e151]:
      - generic "Rename project" [ref=f4e152]: task-003 Task filters
      - generic [ref=f4e153]: 0/2 completed
      - generic [ref=f4e154]:
        - button "Open project" [ref=f4e155] [cursor=pointer]
        - button "Archive project" [ref=f4e156] [cursor=pointer]
    - generic [ref=f4e157]:
      - generic "Rename project" [ref=f4e158]: task-003 Archive lifecycle
      - generic [ref=f4e159]: 0/0 completed
      - generic [ref=f4e160]:
        - button "Open project" [ref=f4e161] [cursor=pointer]
        - button "Archive project" [ref=f4e162] [cursor=pointer]
    - generic [ref=f4e163]:
      - generic "Rename project" [ref=f4e164]: task-003 Archive tasks
      - generic [ref=f4e165]: 1/1 completed
      - generic [ref=f4e166]:
        - button "Open project" [ref=f4e167] [cursor=pointer]
        - button "Archive project" [ref=f4e168] [cursor=pointer]
    - generic [ref=f4e169]:
      - generic "Rename project" [ref=f4e170]: task-001 Alpha create
      - generic [ref=f4e171]: 0/0 completed
      - generic [ref=f4e172]:
        - button "Open project" [ref=f4e173] [cursor=pointer]
        - button "Archive project" [ref=f4e174] [cursor=pointer]
    - generic [ref=f4e175]:
      - generic "Rename project" [ref=f4e176]: task-001 Blank validation sentinel
      - generic [ref=f4e177]: 0/0 completed
      - generic [ref=f4e178]:
        - button "Open project" [ref=f4e179] [cursor=pointer]
        - button "Archive project" [ref=f4e180] [cursor=pointer]
    - generic [ref=f4e181]:
      - generic "Rename project" [ref=f4e182]: task-001 Order first
      - generic [ref=f4e183]: 0/0 completed
      - generic [ref=f4e184]:
        - button "Open project" [ref=f4e185] [cursor=pointer]
        - button "Archive project" [ref=f4e186] [cursor=pointer]
    - generic [ref=f4e187]:
      - generic "Rename project" [ref=f4e188]: task-001 Order second
      - generic [ref=f4e189]: 0/0 completed
      - generic [ref=f4e190]:
        - button "Open project" [ref=f4e191] [cursor=pointer]
        - button "Archive project" [ref=f4e192] [cursor=pointer]
    - generic [ref=f4e193]:
      - generic "Rename project" [ref=f4e194]: task-001 Persistence sentinel
      - generic [ref=f4e195]: 0/0 completed
      - generic [ref=f4e196]:
        - button "Open project" [ref=f4e197] [cursor=pointer]
        - button "Archive project" [ref=f4e198] [cursor=pointer]
    - generic [ref=f4e199]:
      - generic "Rename project" [ref=f4e200]: task-002 Alpha create
      - generic [ref=f4e201]: 0/0 completed
      - generic [ref=f4e202]:
        - button "Open project" [ref=f4e203] [cursor=pointer]
        - button "Archive project" [ref=f4e204] [cursor=pointer]
    - generic [ref=f4e205]:
      - generic "Rename project" [ref=f4e206]: task-002 Blank validation sentinel
      - generic [ref=f4e207]: 0/0 completed
      - generic [ref=f4e208]:
        - button "Open project" [ref=f4e209] [cursor=pointer]
        - button "Archive project" [ref=f4e210] [cursor=pointer]
    - generic [ref=f4e211]:
      - generic "Rename project" [ref=f4e212]: task-002 Order first
      - generic [ref=f4e213]: 0/0 completed
      - generic [ref=f4e214]:
        - button "Open project" [ref=f4e215] [cursor=pointer]
        - button "Archive project" [ref=f4e216] [cursor=pointer]
    - generic [ref=f4e217]:
      - generic "Rename project" [ref=f4e218]: task-002 Order second
      - generic [ref=f4e219]: 0/0 completed
      - generic [ref=f4e220]:
        - button "Open project" [ref=f4e221] [cursor=pointer]
        - button "Archive project" [ref=f4e222] [cursor=pointer]
    - generic [ref=f4e223]:
      - generic "Rename project" [ref=f4e224]: task-002 Task reload
      - generic [ref=f4e225]: 0/1 completed
      - generic [ref=f4e226]:
        - button "Open project" [ref=f4e227] [cursor=pointer]
        - button "Archive project" [ref=f4e228] [cursor=pointer]
    - generic [ref=f4e229]:
      - generic "Rename project" [ref=f4e230]: task-002 Task invalid
      - generic [ref=f4e231]: 0/0 completed
      - generic [ref=f4e232]:
        - button "Open project" [ref=f4e233] [cursor=pointer]
        - button "Archive project" [ref=f4e234] [cursor=pointer]
    - generic [ref=f4e235]:
      - generic "Rename project" [ref=f4e236]: task-002 Task owner
      - generic [ref=f4e237]: 0/1 completed
      - generic [ref=f4e238]:
        - button "Open project" [ref=f4e239] [cursor=pointer]
        - button "Archive project" [ref=f4e240] [cursor=pointer]
    - generic [ref=f4e241]:
      - generic "Rename project" [ref=f4e242]: task-002 Other project
      - generic [ref=f4e243]: 0/0 completed
      - generic [ref=f4e244]:
        - button "Open project" [ref=f4e245] [cursor=pointer]
        - button "Archive project" [ref=f4e246] [cursor=pointer]
    - generic [ref=f4e247]:
      - generic "Rename project" [ref=f4e248]: task-002 Task filters
      - generic [ref=f4e249]: 0/2 completed
      - generic [ref=f4e250]:
        - button "Open project" [ref=f4e251] [cursor=pointer]
        - button "Archive project" [ref=f4e252] [cursor=pointer]
    - generic [ref=f4e253]:
      - generic "Rename project" [ref=f4e254]: task-002 Persistence sentinel
      - generic [ref=f4e255]: 1/1 completed
      - generic [ref=f4e256]:
        - button "Open project" [ref=f4e257] [cursor=pointer]
        - button "Archive project" [ref=f4e258] [cursor=pointer]
    - generic [ref=f4e259]:
      - generic "Rename project" [ref=f4e260]: task-003 Alpha create
      - generic [ref=f4e261]: 0/0 completed
      - generic [ref=f4e262]:
        - button "Open project" [ref=f4e263] [cursor=pointer]
        - button "Archive project" [ref=f4e264] [cursor=pointer]
    - generic [ref=f4e265]:
      - generic "Rename project" [ref=f4e266]: task-003 Blank validation sentinel
      - generic [ref=f4e267]: 0/0 completed
      - generic [ref=f4e268]:
        - button "Open project" [ref=f4e269] [cursor=pointer]
        - button "Archive project" [ref=f4e270] [cursor=pointer]
    - generic [ref=f4e271]:
      - generic "Rename project" [ref=f4e272]: task-003 Order first
      - generic [ref=f4e273]: 0/0 completed
      - generic [ref=f4e274]:
        - button "Open project" [ref=f4e275] [cursor=pointer]
        - button "Archive project" [ref=f4e276] [cursor=pointer]
    - generic [ref=f4e277]:
      - generic "Rename project" [ref=f4e278]: task-003 Order second
      - generic [ref=f4e279]: 0/0 completed
      - generic [ref=f4e280]:
        - button "Open project" [ref=f4e281] [cursor=pointer]
        - button "Archive project" [ref=f4e282] [cursor=pointer]
    - generic [ref=f4e283]:
      - generic "Rename project" [ref=f4e284]: task-003 Task reload
      - generic [ref=f4e285]: 0/1 completed
      - generic [ref=f4e286]:
        - button "Open project" [ref=f4e287] [cursor=pointer]
        - button "Archive project" [ref=f4e288] [cursor=pointer]
    - generic [ref=f4e289]:
      - generic "Rename project" [ref=f4e290]: task-003 Task invalid
      - generic [ref=f4e291]: 0/0 completed
      - generic [ref=f4e292]:
        - button "Open project" [ref=f4e293] [cursor=pointer]
        - button "Archive project" [ref=f4e294] [cursor=pointer]
    - generic [ref=f4e295]:
      - generic "Rename project" [ref=f4e296]: task-003 Task owner
      - generic [ref=f4e297]: 0/1 completed
      - generic [ref=f4e298]:
        - button "Open project" [ref=f4e299] [cursor=pointer]
        - button "Archive project" [ref=f4e300] [cursor=pointer]
    - generic [ref=f4e301]:
      - generic "Rename project" [ref=f4e302]: task-003 Other project
      - generic [ref=f4e303]: 0/0 completed
      - generic [ref=f4e304]:
        - button "Open project" [ref=f4e305] [cursor=pointer]
        - button "Archive project" [ref=f4e306] [cursor=pointer]
    - generic [ref=f4e307]:
      - generic "Rename project" [ref=f4e308]: task-003 Task filters
      - generic [ref=f4e309]: 0/2 completed
      - generic [ref=f4e310]:
        - button "Open project" [ref=f4e311] [cursor=pointer]
        - button "Archive project" [ref=f4e312] [cursor=pointer]
    - generic [ref=f4e313]:
      - generic "Rename project" [ref=f4e314]: task-003 Archive lifecycle
      - generic [ref=f4e315]: 0/0 completed
      - generic [ref=f4e316]:
        - button "Open project" [ref=f4e317] [cursor=pointer]
        - button "Archive project" [ref=f4e318] [cursor=pointer]
    - generic [ref=f4e319]:
      - generic "Rename project" [ref=f4e320]: task-003 Archive tasks
      - generic [ref=f4e321]: 1/1 completed
      - generic [ref=f4e322]:
        - button "Open project" [ref=f4e323] [cursor=pointer]
        - button "Archive project" [ref=f4e324] [cursor=pointer]
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
  10 |   return page.getByTestId('task-row').filter({ hasText: title }).filter({ visible: true });
  11 | }
  12 | export async function createProject(page, name) {
  13 |   await page.goto('/');
  14 |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name === name.trim() ? projectName(name) : '  ' + projectName(name) + '  ');
  15 |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  16 |   await expect(projectRow(page, name.trim())).toBeVisible();
  17 | }
  18 | export async function openProject(page, name) {
> 19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
     |                                                                                           ^ Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
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
```