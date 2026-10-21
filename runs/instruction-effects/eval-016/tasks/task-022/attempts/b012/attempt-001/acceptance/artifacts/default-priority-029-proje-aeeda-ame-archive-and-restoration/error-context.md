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
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').filter({ hasText: 'task-022 Defaults renamed' }).visible().getByRole('button', { name: 'Restore project', exact: true })
Expected: 0
Received: 1

Call log:
  - Expect "toHaveCount" getByTestId('project-row').filter({ hasText: 'task-022 Defaults renamed' }).visible().getByRole('button', { name: 'Restore project', exact: true }) with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-022 Defaults renamed' }).visible().getByRole('button', { name: 'Restore project', exact: true })
    5 × locator resolved to 1 element
      - unexpected value "1"
  - Test timeout of 20000ms exceeded.

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading "Workboard" [level=1] [ref=f1e3]
  - button "Task directory" [ref=f1e4] [cursor=pointer]
  - generic [ref=f1e5]:
    - generic [ref=f1e6]: Project filter
    - combobox "Project filter" [ref=f1e7]:
      - option "Active"
      - option "Archived" [selected]
  - generic [ref=f1e8]:
    - generic [ref=f1e9]: Project search
    - textbox "Project search" [ref=f1e10]
    - button "Search projects" [ref=f1e11] [cursor=pointer]
  - generic [ref=f1e12]:
    - generic [ref=f1e13]: Project name
    - textbox "Project name" [ref=f1e14]
    - button "Create project" [ref=f1e15] [cursor=pointer]
  - generic [ref=f1e16]:
    - generic [ref=f1e17]: Project JSON
    - textbox "Project JSON" [ref=f1e18]
    - generic [ref=f1e19]: Imported project name
    - textbox "Imported project name" [ref=f1e20]
    - button "Import project" [ref=f1e21] [cursor=pointer]
  - region "Projects" [ref=f1e22]:
    - generic [ref=f1e23]:
      - generic [ref=f1e24]:
        - generic [ref=f1e25]: task-003 Persistence sentinel
        - generic [ref=f1e26]: 1/1 completed
      - generic [ref=f1e27]:
        - button "Open project" [ref=f1e28] [cursor=pointer]
        - button "Restore project" [ref=f1e29] [cursor=pointer]
    - generic [ref=f1e30]:
      - generic [ref=f1e31]:
        - generic [ref=f1e32]: task-004 Persistence renamed
        - generic [ref=f1e33]: 1/1 completed
      - generic [ref=f1e34]:
        - button "Open project" [ref=f1e35] [cursor=pointer]
        - button "Restore project" [ref=f1e36] [cursor=pointer]
    - generic [ref=f1e37]:
      - generic [ref=f1e38]:
        - generic [ref=f1e39]: task-005 Persistence renamed
        - generic [ref=f1e40]: 1/1 completed
      - generic [ref=f1e41]:
        - button "Open project" [ref=f1e42] [cursor=pointer]
        - button "Restore project" [ref=f1e43] [cursor=pointer]
    - generic [ref=f1e44]:
      - generic [ref=f1e45]:
        - generic [ref=f1e46]: task-006 Persistence renamed
        - generic [ref=f1e47]: 1/1 completed
      - generic [ref=f1e48]:
        - button "Open project" [ref=f1e49] [cursor=pointer]
        - button "Restore project" [ref=f1e50] [cursor=pointer]
    - generic [ref=f1e51]:
      - generic [ref=f1e52]:
        - generic [ref=f1e53]: task-007 Persistence renamed
        - generic [ref=f1e54]: 1/1 completed
      - generic [ref=f1e55]:
        - button "Open project" [ref=f1e56] [cursor=pointer]
        - button "Restore project" [ref=f1e57] [cursor=pointer]
    - generic [ref=f1e58]:
      - generic [ref=f1e59]:
        - generic [ref=f1e60]: task-008 Persistence renamed
        - generic [ref=f1e61]: 1/1 completed
      - generic [ref=f1e62]:
        - button "Open project" [ref=f1e63] [cursor=pointer]
        - button "Restore project" [ref=f1e64] [cursor=pointer]
    - generic [ref=f1e65]:
      - generic [ref=f1e66]:
        - generic [ref=f1e67]: task-009 Persistence renamed
        - generic [ref=f1e68]: 1/1 completed
      - generic [ref=f1e69]:
        - button "Open project" [ref=f1e70] [cursor=pointer]
        - button "Restore project" [ref=f1e71] [cursor=pointer]
    - generic [ref=f1e72]:
      - generic [ref=f1e73]:
        - generic [ref=f1e74]: task-010 Persistence renamed
        - generic [ref=f1e75]: 1/1 completed
      - generic [ref=f1e76]:
        - button "Open project" [ref=f1e77] [cursor=pointer]
        - button "Restore project" [ref=f1e78] [cursor=pointer]
    - generic [ref=f1e79]:
      - generic [ref=f1e80]:
        - generic [ref=f1e81]: task-011 Options hidden
        - generic [ref=f1e82]: 0/0 completed
      - generic [ref=f1e83]:
        - button "Open project" [ref=f1e84] [cursor=pointer]
        - button "Restore project" [ref=f1e85] [cursor=pointer]
    - generic [ref=f1e86]:
      - generic [ref=f1e87]:
        - generic [ref=f1e88]: task-011 Persistence renamed
        - generic [ref=f1e89]: 1/1 completed
      - generic [ref=f1e90]:
        - button "Open project" [ref=f1e91] [cursor=pointer]
        - button "Restore project" [ref=f1e92] [cursor=pointer]
    - generic [ref=f1e93]:
      - generic [ref=f1e94]:
        - generic [ref=f1e95]: task-012 Options hidden
        - generic [ref=f1e96]: 0/0 completed
      - generic [ref=f1e97]:
        - button "Open project" [ref=f1e98] [cursor=pointer]
        - button "Restore project" [ref=f1e99] [cursor=pointer]
    - generic [ref=f1e100]:
      - generic [ref=f1e101]:
        - generic [ref=f1e102]: task-012 Persistence renamed
        - generic [ref=f1e103]: 1/1 completed
      - generic [ref=f1e104]:
        - button "Open project" [ref=f1e105] [cursor=pointer]
        - button "Restore project" [ref=f1e106] [cursor=pointer]
    - generic [ref=f1e107]:
      - generic [ref=f1e108]:
        - generic [ref=f1e109]: task-013 Options hidden
        - generic [ref=f1e110]: 0/0 completed
      - generic [ref=f1e111]:
        - button "Open project" [ref=f1e112] [cursor=pointer]
        - button "Restore project" [ref=f1e113] [cursor=pointer]
    - generic [ref=f1e114]:
      - generic [ref=f1e115]:
        - generic [ref=f1e116]: task-013 Search MIXED archived
        - generic [ref=f1e117]: 0/0 completed
      - generic [ref=f1e118]:
        - button "Open project" [ref=f1e119] [cursor=pointer]
        - button "Restore project" [ref=f1e120] [cursor=pointer]
    - generic [ref=f1e121]:
      - generic [ref=f1e122]:
        - generic [ref=f1e123]: task-013 Search mutable titles
        - generic [ref=f1e124]: 0/3 completed
      - generic [ref=f1e125]:
        - button "Open project" [ref=f1e126] [cursor=pointer]
        - button "Restore project" [ref=f1e127] [cursor=pointer]
    - generic [ref=f1e128]:
      - generic [ref=f1e129]:
        - generic [ref=f1e130]: task-013 Persistence renamed
        - generic [ref=f1e131]: 1/1 completed
      - generic [ref=f1e132]:
        - button "Open project" [ref=f1e133] [cursor=pointer]
        - button "Restore project" [ref=f1e134] [cursor=pointer]
    - generic [ref=f1e135]:
      - generic [ref=f1e136]:
        - generic [ref=f1e137]: task-014 Options hidden
        - generic [ref=f1e138]: 0/0 completed
      - generic [ref=f1e139]:
        - button "Open project" [ref=f1e140] [cursor=pointer]
        - button "Restore project" [ref=f1e141] [cursor=pointer]
    - generic [ref=f1e142]:
      - generic [ref=f1e143]:
        - generic [ref=f1e144]: task-014 Whitespace Saved archived
        - generic [ref=f1e145]: 0/0 completed
      - generic [ref=f1e146]:
        - button "Open project" [ref=f1e147] [cursor=pointer]
        - button "Restore project" [ref=f1e148] [cursor=pointer]
    - generic [ref=f1e149]:
      - generic [ref=f1e150]:
        - generic [ref=f1e151]: task-014 Search MIXED archived
        - generic [ref=f1e152]: 0/0 completed
      - generic [ref=f1e153]:
        - button "Open project" [ref=f1e154] [cursor=pointer]
        - button "Restore project" [ref=f1e155] [cursor=pointer]
    - generic [ref=f1e156]:
      - generic [ref=f1e157]:
        - generic [ref=f1e158]: task-014 Search mutable titles
        - generic [ref=f1e159]: 0/3 completed
      - generic [ref=f1e160]:
        - button "Open project" [ref=f1e161] [cursor=pointer]
        - button "Restore project" [ref=f1e162] [cursor=pointer]
    - generic [ref=f1e163]:
      - generic [ref=f1e164]:
        - generic [ref=f1e165]: task-014 Persistence renamed
        - generic [ref=f1e166]: 1/1 completed
      - generic [ref=f1e167]:
        - button "Open project" [ref=f1e168] [cursor=pointer]
        - button "Restore project" [ref=f1e169] [cursor=pointer]
    - generic [ref=f1e170]:
      - generic [ref=f1e171]:
        - generic [ref=f1e172]: task-015 Options hidden
        - generic [ref=f1e173]: 0/0 completed
      - generic [ref=f1e174]:
        - button "Open project" [ref=f1e175] [cursor=pointer]
        - button "Restore project" [ref=f1e176] [cursor=pointer]
    - generic [ref=f1e177]:
      - generic [ref=f1e178]:
        - generic [ref=f1e179]: task-015 Whitespace Saved archived
        - generic [ref=f1e180]: 0/0 completed
      - generic [ref=f1e181]:
        - button "Open project" [ref=f1e182] [cursor=pointer]
        - button "Restore project" [ref=f1e183] [cursor=pointer]
    - generic [ref=f1e184]:
      - generic [ref=f1e185]:
        - generic [ref=f1e186]: task-015 Search MIXED archived
        - generic [ref=f1e187]: 0/0 completed
      - generic [ref=f1e188]:
        - button "Open project" [ref=f1e189] [cursor=pointer]
        - button "Restore project" [ref=f1e190] [cursor=pointer]
    - generic [ref=f1e191]:
      - generic [ref=f1e192]:
        - generic [ref=f1e193]: task-015 Search mutable titles
        - generic [ref=f1e194]: 0/3 completed
      - generic [ref=f1e195]:
        - button "Open project" [ref=f1e196] [cursor=pointer]
        - button "Restore project" [ref=f1e197] [cursor=pointer]
    - generic [ref=f1e198]:
      - generic [ref=f1e199]:
        - generic [ref=f1e200]: task-015 Persistence renamed
        - generic [ref=f1e201]: 1/1 completed
      - generic [ref=f1e202]:
        - button "Open project" [ref=f1e203] [cursor=pointer]
        - button "Restore project" [ref=f1e204] [cursor=pointer]
    - generic [ref=f1e205]:
      - generic [ref=f1e206]:
        - generic [ref=f1e207]: task-016 Options hidden
        - generic [ref=f1e208]: 0/0 completed
      - generic [ref=f1e209]:
        - button "Open project" [ref=f1e210] [cursor=pointer]
        - button "Restore project" [ref=f1e211] [cursor=pointer]
    - generic [ref=f1e212]:
      - generic [ref=f1e213]:
        - generic [ref=f1e214]: task-016 Whitespace Saved archived
        - generic [ref=f1e215]: 0/0 completed
      - generic [ref=f1e216]:
        - button "Open project" [ref=f1e217] [cursor=pointer]
        - button "Restore project" [ref=f1e218] [cursor=pointer]
    - generic [ref=f1e219]:
      - generic [ref=f1e220]:
        - generic [ref=f1e221]: task-016 Search MIXED archived
        - generic [ref=f1e222]: 0/0 completed
      - generic [ref=f1e223]:
        - button "Open project" [ref=f1e224] [cursor=pointer]
        - button "Restore project" [ref=f1e225] [cursor=pointer]
    - generic [ref=f1e226]:
      - generic [ref=f1e227]:
        - generic [ref=f1e228]: task-016 Search mutable titles
        - generic [ref=f1e229]: 0/3 completed
      - generic [ref=f1e230]:
        - button "Open project" [ref=f1e231] [cursor=pointer]
        - button "Restore project" [ref=f1e232] [cursor=pointer]
    - generic [ref=f1e233]:
      - generic [ref=f1e234]:
        - generic [ref=f1e235]: task-016 Persistence renamed
        - generic [ref=f1e236]: 1/1 completed
      - generic [ref=f1e237]:
        - button "Open project" [ref=f1e238] [cursor=pointer]
        - button "Restore project" [ref=f1e239] [cursor=pointer]
    - generic [ref=f1e240]:
      - generic [ref=f1e241]:
        - generic [ref=f1e242]: task-017 Options hidden
        - generic [ref=f1e243]: 0/0 completed
      - generic [ref=f1e244]:
        - button "Open project" [ref=f1e245] [cursor=pointer]
        - button "Restore project" [ref=f1e246] [cursor=pointer]
    - generic [ref=f1e247]:
      - generic [ref=f1e248]:
        - generic [ref=f1e249]: task-017 Whitespace Saved archived
        - generic [ref=f1e250]: 0/0 completed
      - generic [ref=f1e251]:
        - button "Open project" [ref=f1e252] [cursor=pointer]
        - button "Restore project" [ref=f1e253] [cursor=pointer]
    - generic [ref=f1e254]:
      - generic [ref=f1e255]:
        - generic [ref=f1e256]: task-017 Search MIXED archived
        - generic [ref=f1e257]: 0/0 completed
      - generic [ref=f1e258]:
        - button "Open project" [ref=f1e259] [cursor=pointer]
        - button "Restore project" [ref=f1e260] [cursor=pointer]
    - generic [ref=f1e261]:
      - generic [ref=f1e262]:
        - generic [ref=f1e263]: task-017 Search mutable titles
        - generic [ref=f1e264]: 0/3 completed
      - generic [ref=f1e265]:
        - button "Open project" [ref=f1e266] [cursor=pointer]
        - button "Restore project" [ref=f1e267] [cursor=pointer]
    - generic [ref=f1e268]:
      - generic [ref=f1e269]:
        - generic [ref=f1e270]: task-017 Persistence renamed
        - generic [ref=f1e271]: 1/1 completed
      - generic [ref=f1e272]:
        - button "Open project" [ref=f1e273] [cursor=pointer]
        - button "Restore project" [ref=f1e274] [cursor=pointer]
    - generic [ref=f1e275]:
      - generic [ref=f1e276]:
        - generic [ref=f1e277]: task-018 Parse guard archived
        - generic [ref=f1e278]: 0/0 completed
      - generic [ref=f1e279]:
        - button "Open project" [ref=f1e280] [cursor=pointer]
        - button "Restore project" [ref=f1e281] [cursor=pointer]
    - generic [ref=f1e282]:
      - generic [ref=f1e283]:
        - generic [ref=f1e284]: task-018 Task guard archived
        - generic [ref=f1e285]: 0/0 completed
      - generic [ref=f1e286]:
        - button "Open project" [ref=f1e287] [cursor=pointer]
        - button "Restore project" [ref=f1e288] [cursor=pointer]
    - generic [ref=f1e289]:
      - generic [ref=f1e290]:
        - generic [ref=f1e291]: task-018 Options hidden
        - generic [ref=f1e292]: 0/0 completed
      - generic [ref=f1e293]:
        - button "Open project" [ref=f1e294] [cursor=pointer]
        - button "Restore project" [ref=f1e295] [cursor=pointer]
    - generic [ref=f1e296]:
      - generic [ref=f1e297]:
        - generic [ref=f1e298]: task-018 Whitespace Saved archived
        - generic [ref=f1e299]: 0/0 completed
      - generic [ref=f1e300]:
        - button "Open project" [ref=f1e301] [cursor=pointer]
        - button "Restore project" [ref=f1e302] [cursor=pointer]
    - generic [ref=f1e303]:
      - generic [ref=f1e304]:
        - generic [ref=f1e305]: task-018 Search MIXED archived
        - generic [ref=f1e306]: 0/0 completed
      - generic [ref=f1e307]:
        - button "Open project" [ref=f1e308] [cursor=pointer]
        - button "Restore project" [ref=f1e309] [cursor=pointer]
    - generic [ref=f1e310]:
      - generic [ref=f1e311]:
        - generic [ref=f1e312]: task-018 Search mutable titles
        - generic [ref=f1e313]: 0/3 completed
      - generic [ref=f1e314]:
        - button "Open project" [ref=f1e315] [cursor=pointer]
        - button "Restore project" [ref=f1e316] [cursor=pointer]
    - generic [ref=f1e317]:
      - generic [ref=f1e318]:
        - generic [ref=f1e319]: task-018 Persistence renamed
        - generic [ref=f1e320]: 1/1 completed
      - generic [ref=f1e321]:
        - button "Open project" [ref=f1e322] [cursor=pointer]
        - button "Restore project" [ref=f1e323] [cursor=pointer]
    - generic [ref=f1e324]:
      - generic [ref=f1e325]:
        - generic [ref=f1e326]: task-019 Directory archived owner
        - generic [ref=f1e327]: 0/1 completed
      - generic [ref=f1e328]:
        - button "Open project" [ref=f1e329] [cursor=pointer]
        - button "Restore project" [ref=f1e330] [cursor=pointer]
    - generic [ref=f1e331]:
      - generic [ref=f1e332]:
        - generic [ref=f1e333]: task-019 Directory filter archive
        - generic [ref=f1e334]: 0/1 completed
      - generic [ref=f1e335]:
        - button "Open project" [ref=f1e336] [cursor=pointer]
        - button "Restore project" [ref=f1e337] [cursor=pointer]
    - generic [ref=f1e338]:
      - generic [ref=f1e339]:
        - generic [ref=f1e340]: task-019 Parse guard archived
        - generic [ref=f1e341]: 0/0 completed
      - generic [ref=f1e342]:
        - button "Open project" [ref=f1e343] [cursor=pointer]
        - button "Restore project" [ref=f1e344] [cursor=pointer]
    - generic [ref=f1e345]:
      - generic [ref=f1e346]:
        - generic [ref=f1e347]: task-019 Task guard archived
        - generic [ref=f1e348]: 0/0 completed
      - generic [ref=f1e349]:
        - button "Open project" [ref=f1e350] [cursor=pointer]
        - button "Restore project" [ref=f1e351] [cursor=pointer]
    - generic [ref=f1e352]:
      - generic [ref=f1e353]:
        - generic [ref=f1e354]: task-019 Options hidden
        - generic [ref=f1e355]: 0/0 completed
      - generic [ref=f1e356]:
        - button "Open project" [ref=f1e357] [cursor=pointer]
        - button "Restore project" [ref=f1e358] [cursor=pointer]
    - generic [ref=f1e359]:
      - generic [ref=f1e360]:
        - generic [ref=f1e361]: task-019 Whitespace Saved archived
        - generic [ref=f1e362]: 0/0 completed
      - generic [ref=f1e363]:
        - button "Open project" [ref=f1e364] [cursor=pointer]
        - button "Restore project" [ref=f1e365] [cursor=pointer]
    - generic [ref=f1e366]:
      - generic [ref=f1e367]:
        - generic [ref=f1e368]: task-019 Search MIXED archived
        - generic [ref=f1e369]: 0/0 completed
      - generic [ref=f1e370]:
        - button "Open project" [ref=f1e371] [cursor=pointer]
        - button "Restore project" [ref=f1e372] [cursor=pointer]
    - generic [ref=f1e373]:
      - generic [ref=f1e374]:
        - generic [ref=f1e375]: task-019 Search mutable titles
        - generic [ref=f1e376]: 0/3 completed
      - generic [ref=f1e377]:
        - button "Open project" [ref=f1e378] [cursor=pointer]
        - button "Restore project" [ref=f1e379] [cursor=pointer]
    - generic [ref=f1e380]:
      - generic [ref=f1e381]:
        - generic [ref=f1e382]: task-019 Persistence renamed
        - generic [ref=f1e383]: 1/1 completed
      - generic [ref=f1e384]:
        - button "Open project" [ref=f1e385] [cursor=pointer]
        - button "Restore project" [ref=f1e386] [cursor=pointer]
    - generic [ref=f1e387]:
      - generic [ref=f1e388]:
        - generic [ref=f1e389]: task-020 Bulk archived owner
        - generic [ref=f1e390]: 0/1 completed
      - generic [ref=f1e391]:
        - button "Open project" [ref=f1e392] [cursor=pointer]
        - button "Restore project" [ref=f1e393] [cursor=pointer]
    - generic [ref=f1e394]:
      - generic [ref=f1e395]:
        - generic [ref=f1e396]: task-020 Bulk protected archived
        - generic [ref=f1e397]: 1/1 completed
      - generic [ref=f1e398]:
        - button "Open project" [ref=f1e399] [cursor=pointer]
        - button "Restore project" [ref=f1e400] [cursor=pointer]
    - generic [ref=f1e401]:
      - generic [ref=f1e402]:
        - generic [ref=f1e403]: task-020 Directory archived owner
        - generic [ref=f1e404]: 0/1 completed
      - generic [ref=f1e405]:
        - button "Open project" [ref=f1e406] [cursor=pointer]
        - button "Restore project" [ref=f1e407] [cursor=pointer]
    - generic [ref=f1e408]:
      - generic [ref=f1e409]:
        - generic [ref=f1e410]: task-020 Directory filter archive
        - generic [ref=f1e411]: 0/1 completed
      - generic [ref=f1e412]:
        - button "Open project" [ref=f1e413] [cursor=pointer]
        - button "Restore project" [ref=f1e414] [cursor=pointer]
    - generic [ref=f1e415]:
      - generic [ref=f1e416]:
        - generic [ref=f1e417]: task-020 Parse guard archived
        - generic [ref=f1e418]: 0/0 completed
      - generic [ref=f1e419]:
        - button "Open project" [ref=f1e420] [cursor=pointer]
        - button "Restore project" [ref=f1e421] [cursor=pointer]
    - generic [ref=f1e422]:
      - generic [ref=f1e423]:
        - generic [ref=f1e424]: task-020 Task guard archived
        - generic [ref=f1e425]: 0/0 completed
      - generic [ref=f1e426]:
        - button "Open project" [ref=f1e427] [cursor=pointer]
        - button "Restore project" [ref=f1e428] [cursor=pointer]
    - generic [ref=f1e429]:
      - generic [ref=f1e430]:
        - generic [ref=f1e431]: task-020 Options hidden
        - generic [ref=f1e432]: 0/0 completed
      - generic [ref=f1e433]:
        - button "Open project" [ref=f1e434] [cursor=pointer]
        - button "Restore project" [ref=f1e435] [cursor=pointer]
    - generic [ref=f1e436]:
      - generic [ref=f1e437]:
        - generic [ref=f1e438]: task-020 Whitespace Saved archived
        - generic [ref=f1e439]: 0/0 completed
      - generic [ref=f1e440]:
        - button "Open project" [ref=f1e441] [cursor=pointer]
        - button "Restore project" [ref=f1e442] [cursor=pointer]
    - generic [ref=f1e443]:
      - generic [ref=f1e444]:
        - generic [ref=f1e445]: task-020 Search MIXED archived
        - generic [ref=f1e446]: 0/0 completed
      - generic [ref=f1e447]:
        - button "Open project" [ref=f1e448] [cursor=pointer]
        - button "Restore project" [ref=f1e449] [cursor=pointer]
    - generic [ref=f1e450]:
      - generic [ref=f1e451]:
        - generic [ref=f1e452]: task-020 Search mutable titles
        - generic [ref=f1e453]: 0/3 completed
      - generic [ref=f1e454]:
        - button "Open project" [ref=f1e455] [cursor=pointer]
        - button "Restore project" [ref=f1e456] [cursor=pointer]
    - generic [ref=f1e457]:
      - generic [ref=f1e458]:
        - generic [ref=f1e459]: task-020 Persistence renamed
        - generic [ref=f1e460]: 1/1 completed
      - generic [ref=f1e461]:
        - button "Open project" [ref=f1e462] [cursor=pointer]
        - button "Restore project" [ref=f1e463] [cursor=pointer]
    - generic [ref=f1e464]:
      - generic [ref=f1e465]:
        - generic [ref=f1e466]: task-021 Bulk archived owner
        - generic [ref=f1e467]: 0/1 completed
      - generic [ref=f1e468]:
        - button "Open project" [ref=f1e469] [cursor=pointer]
        - button "Restore project" [ref=f1e470] [cursor=pointer]
    - generic [ref=f1e471]:
      - generic [ref=f1e472]:
        - generic [ref=f1e473]: task-021 Bulk protected archived
        - generic [ref=f1e474]: 1/1 completed
      - generic [ref=f1e475]:
        - button "Open project" [ref=f1e476] [cursor=pointer]
        - button "Restore project" [ref=f1e477] [cursor=pointer]
    - generic [ref=f1e478]:
      - generic [ref=f1e479]:
        - generic [ref=f1e480]: task-021 Ordering archived first
        - generic [ref=f1e481]: 0/1 completed
      - generic [ref=f1e482]:
        - button "Open project" [ref=f1e483] [cursor=pointer]
        - button "Restore project" [ref=f1e484] [cursor=pointer]
    - generic [ref=f1e485]:
      - generic [ref=f1e486]:
        - generic [ref=f1e487]: task-021 Ordering archived second
        - generic [ref=f1e488]: 0/0 completed
      - generic [ref=f1e489]:
        - button "Open project" [ref=f1e490] [cursor=pointer]
        - button "Restore project" [ref=f1e491] [cursor=pointer]
    - generic [ref=f1e492]:
      - generic [ref=f1e493]:
        - generic [ref=f1e494]: task-021 Ordering archived third
        - generic [ref=f1e495]: 0/0 completed
      - generic [ref=f1e496]:
        - button "Open project" [ref=f1e497] [cursor=pointer]
        - button "Restore project" [ref=f1e498] [cursor=pointer]
    - generic [ref=f1e499]:
      - generic [ref=f1e500]:
        - generic [ref=f1e501]: task-021 Directory archived owner
        - generic [ref=f1e502]: 0/1 completed
      - generic [ref=f1e503]:
        - button "Open project" [ref=f1e504] [cursor=pointer]
        - button "Restore project" [ref=f1e505] [cursor=pointer]
    - generic [ref=f1e506]:
      - generic [ref=f1e507]:
        - generic [ref=f1e508]: task-021 Directory filter archive
        - generic [ref=f1e509]: 0/1 completed
      - generic [ref=f1e510]:
        - button "Open project" [ref=f1e511] [cursor=pointer]
        - button "Restore project" [ref=f1e512] [cursor=pointer]
    - generic [ref=f1e513]:
      - generic [ref=f1e514]:
        - generic [ref=f1e515]: task-021 Parse guard archived
        - generic [ref=f1e516]: 0/0 completed
      - generic [ref=f1e517]:
        - button "Open project" [ref=f1e518] [cursor=pointer]
        - button "Restore project" [ref=f1e519] [cursor=pointer]
    - generic [ref=f1e520]:
      - generic [ref=f1e521]:
        - generic [ref=f1e522]: task-021 Task guard archived
        - generic [ref=f1e523]: 0/0 completed
      - generic [ref=f1e524]:
        - button "Open project" [ref=f1e525] [cursor=pointer]
        - button "Restore project" [ref=f1e526] [cursor=pointer]
    - generic [ref=f1e527]:
      - generic [ref=f1e528]:
        - generic [ref=f1e529]: task-021 Options hidden
        - generic [ref=f1e530]: 0/0 completed
      - generic [ref=f1e531]:
        - button "Open project" [ref=f1e532] [cursor=pointer]
        - button "Restore project" [ref=f1e533] [cursor=pointer]
    - generic [ref=f1e534]:
      - generic [ref=f1e535]:
        - generic [ref=f1e536]: task-021 Whitespace Saved archived
        - generic [ref=f1e537]: 0/0 completed
      - generic [ref=f1e538]:
        - button "Open project" [ref=f1e539] [cursor=pointer]
        - button "Restore project" [ref=f1e540] [cursor=pointer]
    - generic [ref=f1e541]:
      - generic [ref=f1e542]:
        - generic [ref=f1e543]: task-021 Search MIXED archived
        - generic [ref=f1e544]: 0/0 completed
      - generic [ref=f1e545]:
        - button "Open project" [ref=f1e546] [cursor=pointer]
        - button "Restore project" [ref=f1e547] [cursor=pointer]
    - generic [ref=f1e548]:
      - generic [ref=f1e549]:
        - generic [ref=f1e550]: task-021 Search mutable titles
        - generic [ref=f1e551]: 0/3 completed
      - generic [ref=f1e552]:
        - button "Open project" [ref=f1e553] [cursor=pointer]
        - button "Restore project" [ref=f1e554] [cursor=pointer]
    - generic [ref=f1e555]:
      - generic [ref=f1e556]:
        - generic [ref=f1e557]: task-021 Persistence renamed
        - generic [ref=f1e558]: 1/1 completed
      - generic [ref=f1e559]:
        - button "Open project" [ref=f1e560] [cursor=pointer]
        - button "Restore project" [ref=f1e561] [cursor=pointer]
    - generic [ref=f1e562]:
      - generic [ref=f1e563]:
        - generic [ref=f1e564]: task-022 Defaults renamed
        - generic [ref=f1e565]: 0/1 completed
      - generic [ref=f1e566]:
        - button "Open project" [ref=f1e567] [cursor=pointer]
        - button "Restore project" [ref=f1e568] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3  | const defaults=page=>page.getByRole('combobox',{name:'Default task priority',exact:true});
  4  | const priority=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true});
  5  | export async function persistedDefault(page,project,value) {
  6  |  const observer=await page.context().newPage();
  7  |  try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return defaults(observer).locator('option:checked').textContent();},{timeout:5000}).toBe(value);} finally {await observer.close();}
  8  | }
  9  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  10 | if(stage>=8) {
  11 |  test('027 pre-default projects and tasks preserve their distinct saved priorities',async({page})=>{
  12 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  13 |   const prior=page.getByTestId('project-row').filter({hasText:'task-007 Persistence renamed'}).filter({visible:true});
  14 |   await expect(prior.getByTestId('project-summary')).toHaveText('1/1 completed');
  15 |   await prior.getByRole('button',{name:'Open project',exact:true}).click();
  16 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');await expect(defaults(page)).toBeDisabled();
  17 |   await expect(priority(page,'Memory kept').locator('option:checked')).toHaveText('High');
  18 |   await expect(page.getByRole('checkbox',{name:'Complete Memory kept',exact:true})).toBeChecked();
  19 |  });
  20 |  test('028 project default affects only future tasks and retains filters and summary',async({page})=>{
  21 |   await createProject(page,'Defaults independent');
  22 |   await createProject(page,'Defaults inheritance');await openProject(page,'Defaults inheritance');
  23 |   await expect(defaults(page).locator('option')).toHaveText(['Low','Normal','High']);
  24 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');
  25 |   await createTask(page,'Before default change');
  26 |   await page.getByRole('checkbox',{name:'Complete Before default change',exact:true}).check();
  27 |   await expectPersistedCompletion(page,'Defaults inheritance','Before default change',true);
  28 |   await defaults(page).selectOption({label:'High'});await persistedDefault(page,'Defaults inheritance','High');
  29 |   await createTask(page,'Inherited high');await expectPersistedPriority(page,'Defaults inheritance','Inherited high','High');
  30 |   await expect(priority(page,'Before default change').locator('option:checked')).toHaveText('Normal');
  31 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});
  32 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});
  33 |   await defaults(page).selectOption({label:'Low'});await persistedDefault(page,'Defaults inheritance','Low');
  34 |   await persistedDefault(page,'Defaults independent','Normal');
  35 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');
  36 |   await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  37 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  38 |   await expect(priority(page,'Inherited high').locator('option:checked')).toHaveText('High');
  39 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});
  40 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});
  41 |   await createTask(page,'Inherited low');await expectPersistedPriority(page,'Defaults inheritance','Inherited low','Low');
  42 |   await defaults(page).selectOption({label:'Normal'});await persistedDefault(page,'Defaults inheritance','Normal');
  43 |   await createTask(page,'Inherited normal');await expectPersistedPriority(page,'Defaults inheritance','Inherited normal','Normal');
  44 |   await expect(priority(page,'Inherited high').locator('option:checked')).toHaveText('High');
  45 |   await expect(priority(page,'Inherited low').locator('option:checked')).toHaveText('Low');
  46 |   const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
  47 |   for(const [i,title] of ['Before default change','Inherited high','Inherited low','Inherited normal'].entries())expect(rows[i]).toContain(title);
  48 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Defaults inheritance').getByTestId('project-summary')).toHaveText('1/4 completed');
  49 |   await page.goto('/');await openProject(page,'Defaults independent');
  50 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');await createTask(page,'Independent normal');
  51 |   await expect(priority(page,'Independent normal').locator('option:checked')).toHaveText('Normal');
  52 |  });
  53 |  test('029 project default survives rename archive and restoration',async({page})=>{
  54 |   await createProject(page,'Defaults lifecycle');await openProject(page,'Defaults lifecycle');
  55 |   await defaults(page).selectOption({label:'Low'});await persistedDefault(page,'Defaults lifecycle','Low');
  56 |   await createTask(page,'Lifecycle task');await expectPersistedPriority(page,'Defaults lifecycle','Lifecycle task','Low');
  57 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Defaults renamed'));
  58 |   await page.getByRole('button',{name:'Rename project',exact:true}).click();
  59 |   await expect(page.getByRole('heading',{name:projectName('Defaults renamed'),exact:true}).first()).toBeVisible();
  60 |   await persistedDefault(page,'Defaults renamed','Low');await page.reload();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  61 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Defaults renamed').getByRole('button',{name:'Archive project',exact:true}).click();
  62 |   await expect(projectRow(page,'Defaults renamed')).toHaveCount(0);
  63 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Defaults renamed');
  64 |   await expect(defaults(page)).toBeDisabled();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  65 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
> 66 |   await projectRow(page,'Defaults renamed').getByRole('button',{name:'Restore project',exact:true}).click();await expect(projectRow(page,'Defaults renamed').getByRole('button',{name:'Restore project',exact:true})).toHaveCount(0);
     |                                                                                                                                                                                                                       ^ Error: expect(locator).toHaveCount(expected) failed
  67 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Defaults renamed');
  68 |   await expect(defaults(page)).toBeEnabled();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  69 |   await expect(priority(page,'Lifecycle task').locator('option:checked')).toHaveText('Low');
  70 |   await createTask(page,'Restored inherits');await expectPersistedPriority(page,'Defaults renamed','Restored inherits','Low');
  71 |  });
  72 | }
  73 | 
```