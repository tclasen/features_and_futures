# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 015 archived rename controls become available after restoration
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/workboard.spec.mjs:243:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Rename archive' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f7e1]:
  - heading "Workboard" [level=1] [ref=f7e2]
  - group [ref=f7e4]:
    - button "Task directory" [ref=f7e5]
  - group [ref=f7e7]:
    - generic [ref=f7e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f7e9]
    - generic [ref=f7e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f7e11]
    - button "Import project" [ref=f7e12]
  - group [ref=f7e14]:
    - generic [ref=f7e15]:
      - text: Project name
      - textbox "Project name" [ref=f7e16]
    - button "Create project" [ref=f7e17]
  - group [ref=f7e19]:
    - generic [ref=f7e20]:
      - text: Project search
      - textbox "Project search" [ref=f7e21]
    - button "Search projects" [ref=f7e22]
  - generic [ref=f7e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f7e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f7e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f7e28]:
      - button "Open project" [ref=f7e29]
    - group [ref=f7e31]:
      - button "Archive project" [ref=f7e32]
  - generic [ref=f7e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f7e35]:
      - button "Open project" [ref=f7e36]
    - group [ref=f7e38]:
      - button "Archive project" [ref=f7e39]
  - generic [ref=f7e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f7e42]:
      - button "Open project" [ref=f7e43]
    - group [ref=f7e45]:
      - button "Archive project" [ref=f7e46]
  - generic [ref=f7e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f7e49]:
      - button "Open project" [ref=f7e50]
    - group [ref=f7e52]:
      - button "Archive project" [ref=f7e53]
  - generic [ref=f7e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f7e56]:
      - button "Open project" [ref=f7e57]
    - group [ref=f7e59]:
      - button "Archive project" [ref=f7e60]
  - generic [ref=f7e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f7e63]:
      - button "Open project" [ref=f7e64]
    - group [ref=f7e66]:
      - button "Archive project" [ref=f7e67]
  - generic [ref=f7e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f7e70]:
      - button "Open project" [ref=f7e71]
    - group [ref=f7e73]:
      - button "Archive project" [ref=f7e74]
  - generic [ref=f7e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f7e77]:
      - button "Open project" [ref=f7e78]
    - group [ref=f7e80]:
      - button "Archive project" [ref=f7e81]
  - generic [ref=f7e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f7e84]:
      - button "Open project" [ref=f7e85]
    - group [ref=f7e87]:
      - button "Archive project" [ref=f7e88]
  - generic [ref=f7e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f7e91]:
      - button "Open project" [ref=f7e92]
    - group [ref=f7e94]:
      - button "Archive project" [ref=f7e95]
  - generic [ref=f7e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f7e98]:
      - button "Open project" [ref=f7e99]
    - group [ref=f7e101]:
      - button "Archive project" [ref=f7e102]
  - generic [ref=f7e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f7e105]:
      - button "Open project" [ref=f7e106]
    - group [ref=f7e108]:
      - button "Archive project" [ref=f7e109]
  - generic [ref=f7e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f7e112]:
      - button "Open project" [ref=f7e113]
    - group [ref=f7e115]:
      - button "Archive project" [ref=f7e116]
  - generic [ref=f7e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f7e119]:
      - button "Open project" [ref=f7e120]
    - group [ref=f7e122]:
      - button "Archive project" [ref=f7e123]
  - generic [ref=f7e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f7e126]:
      - button "Open project" [ref=f7e127]
    - group [ref=f7e129]:
      - button "Archive project" [ref=f7e130]
  - generic [ref=f7e131]:
    - text: task-020 Deletion fields4/6 completed
    - group [ref=f7e133]:
      - button "Open project" [ref=f7e134]
    - group [ref=f7e136]:
      - button "Archive project" [ref=f7e137]
  - generic [ref=f7e138]:
    - text: task-020 Deletion target1/3 completed
    - group [ref=f7e140]:
      - button "Open project" [ref=f7e141]
    - group [ref=f7e143]:
      - button "Archive project" [ref=f7e144]
  - generic [ref=f7e145]:
    - text: task-020 Deletion order0/3 completed
    - group [ref=f7e147]:
      - button "Open project" [ref=f7e148]
    - group [ref=f7e150]:
      - button "Archive project" [ref=f7e151]
  - generic [ref=f7e152]:
    - text: task-020 Deletion restart0/0 completed
    - group [ref=f7e154]:
      - button "Open project" [ref=f7e155]
    - group [ref=f7e157]:
      - button "Archive project" [ref=f7e158]
  - generic [ref=f7e159]:
    - text: task-020 Deleted intersections0/0 completed
    - group [ref=f7e161]:
      - button "Open project" [ref=f7e162]
    - group [ref=f7e164]:
      - button "Archive project" [ref=f7e165]
  - generic [ref=f7e166]:
    - text: task-020 Directory Zulu owner1/3 completed
    - group [ref=f7e168]:
      - button "Open project" [ref=f7e169]
    - group [ref=f7e171]:
      - button "Archive project" [ref=f7e172]
  - generic [ref=f7e173]:
    - text: task-020 Directory Alpha owner0/1 completed
    - group [ref=f7e175]:
      - button "Open project" [ref=f7e176]
    - group [ref=f7e178]:
      - button "Archive project" [ref=f7e179]
  - generic [ref=f7e180]:
    - text: task-020 Directory filter owner1/5 completed
    - group [ref=f7e182]:
      - button "Open project" [ref=f7e183]
    - group [ref=f7e185]:
      - button "Archive project" [ref=f7e186]
  - generic [ref=f7e187]:
    - text: task-020 Directory whitespace0/1 completed
    - group [ref=f7e189]:
      - button "Open project" [ref=f7e190]
    - group [ref=f7e192]:
      - button "Archive project" [ref=f7e193]
  - generic [ref=f7e194]:
    - text: task-020 Calendar persistence0/1 completed
    - group [ref=f7e196]:
      - button "Open project" [ref=f7e197]
    - group [ref=f7e199]:
      - button "Archive project" [ref=f7e200]
  - generic [ref=f7e201]:
    - text: task-020 Calendar validation0/1 completed
    - group [ref=f7e203]:
      - button "Open project" [ref=f7e204]
    - group [ref=f7e206]:
      - button "Archive project" [ref=f7e207]
  - generic [ref=f7e208]:
    - text: task-020 Calendar independence2/3 completed
    - group [ref=f7e210]:
      - button "Open project" [ref=f7e211]
    - group [ref=f7e213]:
      - button "Archive project" [ref=f7e214]
  - generic [ref=f7e215]:
    - text: task-020 Calendar second owner0/1 completed
    - group [ref=f7e217]:
      - button "Open project" [ref=f7e218]
    - group [ref=f7e220]:
      - button "Archive project" [ref=f7e221]
  - generic [ref=f7e222]:
    - text: task-020 Calendar archival0/1 completed
    - group [ref=f7e224]:
      - button "Open project" [ref=f7e225]
    - group [ref=f7e227]:
      - button "Archive project" [ref=f7e228]
  - generic [ref=f7e229]:
    - text: task-020 Range boundaries0/5 completed
    - group [ref=f7e231]:
      - button "Open project" [ref=f7e232]
    - group [ref=f7e234]:
      - button "Archive project" [ref=f7e235]
  - generic [ref=f7e236]:
    - text: task-020 Range intersections0/4 completed
    - group [ref=f7e238]:
      - button "Open project" [ref=f7e239]
    - group [ref=f7e241]:
      - button "Archive project" [ref=f7e242]
  - generic [ref=f7e243]:
    - text: task-020 Range validation0/2 completed
    - group [ref=f7e245]:
      - button "Open project" [ref=f7e246]
    - group [ref=f7e248]:
      - button "Archive project" [ref=f7e249]
  - generic [ref=f7e250]:
    - text: task-020 Range archival0/2 completed
    - group [ref=f7e252]:
      - button "Open project" [ref=f7e253]
    - group [ref=f7e255]:
      - button "Archive project" [ref=f7e256]
  - generic [ref=f7e257]:
    - text: task-020 Range owner renamed0/3 completed
    - group [ref=f7e259]:
      - button "Open project" [ref=f7e260]
    - group [ref=f7e262]:
      - button "Archive project" [ref=f7e263]
  - generic [ref=f7e264]:
    - text: task-020 Export foreign0/1 completed
    - group [ref=f7e266]:
      - button "Open project" [ref=f7e267]
    - group [ref=f7e269]:
      - button "Archive project" [ref=f7e270]
  - generic [ref=f7e271]:
    - text: task-020 Export full Ω0/2 completed
    - group [ref=f7e273]:
      - button "Open project" [ref=f7e274]
    - group [ref=f7e276]:
      - button "Archive project" [ref=f7e277]
  - generic [ref=f7e278]:
    - text: task-020 Export empty0/0 completed
    - group [ref=f7e280]:
      - button "Open project" [ref=f7e281]
    - group [ref=f7e283]:
      - button "Archive project" [ref=f7e284]
  - generic [ref=f7e285]:
    - text: task-020 Import origin0/2 completed
    - group [ref=f7e287]:
      - button "Open project" [ref=f7e288]
    - group [ref=f7e290]:
      - button "Archive project" [ref=f7e291]
  - generic [ref=f7e292]:
    - text: task-020 Import copy1/4 completed
    - group [ref=f7e294]:
      - button "Open project" [ref=f7e295]
    - group [ref=f7e297]:
      - button "Archive project" [ref=f7e298]
  - generic [ref=f7e299]:
    - text: task-020 Parse guard existing0/1 completed
    - group [ref=f7e301]:
      - button "Open project" [ref=f7e302]
    - group [ref=f7e304]:
      - button "Archive project" [ref=f7e305]
  - generic [ref=f7e306]:
    - text: task-020 Task guard existing0/1 completed
    - group [ref=f7e308]:
      - button "Open project" [ref=f7e309]
    - group [ref=f7e311]:
      - button "Archive project" [ref=f7e312]
  - generic [ref=f7e313]:
    - text: task-020 Import restart0/1 completed
    - group [ref=f7e315]:
      - button "Open project" [ref=f7e316]
    - group [ref=f7e318]:
      - button "Archive project" [ref=f7e319]
  - generic [ref=f7e320]:
    - text: task-020 Transfer target1/3 completed
    - group [ref=f7e322]:
      - button "Open project" [ref=f7e323]
    - group [ref=f7e325]:
      - button "Archive project" [ref=f7e326]
  - generic [ref=f7e327]:
    - text: task-020 Transfer source0/1 completed
    - group [ref=f7e329]:
      - button "Open project" [ref=f7e330]
    - group [ref=f7e332]:
      - button "Archive project" [ref=f7e333]
  - generic [ref=f7e334]:
    - text: task-020 Filtered transfer target0/2 completed
    - group [ref=f7e336]:
      - button "Open project" [ref=f7e337]
    - group [ref=f7e339]:
      - button "Archive project" [ref=f7e340]
  - generic [ref=f7e341]:
    - text: task-020 Filtered transfer source1/5 completed
    - group [ref=f7e343]:
      - button "Open project" [ref=f7e344]
    - group [ref=f7e346]:
      - button "Archive project" [ref=f7e347]
  - generic [ref=f7e348]:
    - text: task-020 Options first0/0 completed
    - group [ref=f7e350]:
      - button "Open project" [ref=f7e351]
    - group [ref=f7e353]:
      - button "Archive project" [ref=f7e354]
  - generic [ref=f7e355]:
    - text: task-020 Options second0/0 completed
    - group [ref=f7e357]:
      - button "Open project" [ref=f7e358]
    - group [ref=f7e360]:
      - button "Archive project" [ref=f7e361]
  - generic [ref=f7e362]:
    - text: task-020 Options owner0/1 completed
    - group [ref=f7e364]:
      - button "Open project" [ref=f7e365]
    - group [ref=f7e367]:
      - button "Archive project" [ref=f7e368]
  - generic [ref=f7e369]:
    - text: task-020 Read-only transfer target0/1 completed
    - group [ref=f7e371]:
      - button "Open project" [ref=f7e372]
    - group [ref=f7e374]:
      - button "Archive project" [ref=f7e375]
  - generic [ref=f7e376]:
    - text: task-020 Read-only transfer owner0/2 completed
    - group [ref=f7e378]:
      - button "Open project" [ref=f7e379]
    - group [ref=f7e381]:
      - button "Archive project" [ref=f7e382]
  - generic [ref=f7e383]:
    - text: task-020 Notes values0/2 completed
    - group [ref=f7e385]:
      - button "Open project" [ref=f7e386]
    - group [ref=f7e388]:
      - button "Archive project" [ref=f7e389]
  - generic [ref=f7e390]:
    - text: task-020 Notes target0/1 completed
    - group [ref=f7e392]:
      - button "Open project" [ref=f7e393]
    - group [ref=f7e395]:
      - button "Archive project" [ref=f7e396]
  - generic [ref=f7e397]:
    - text: task-020 Notes owner0/3 completed
    - group [ref=f7e399]:
      - button "Open project" [ref=f7e400]
    - group [ref=f7e402]:
      - button "Archive project" [ref=f7e403]
  - generic [ref=f7e404]:
    - text: task-020 Priority intersection1/4 completed
    - group [ref=f7e406]:
      - button "Open project" [ref=f7e407]
    - group [ref=f7e409]:
      - button "Archive project" [ref=f7e410]
  - generic [ref=f7e411]:
    - text: task-020 Priority live filters1/4 completed
    - group [ref=f7e413]:
      - button "Open project" [ref=f7e414]
    - group [ref=f7e416]:
      - button "Archive project" [ref=f7e417]
  - generic [ref=f7e418]:
    - text: task-020 Priority rename filters1/3 completed
    - group [ref=f7e420]:
      - button "Open project" [ref=f7e421]
    - group [ref=f7e423]:
      - button "Archive project" [ref=f7e424]
  - generic [ref=f7e425]:
    - text: task-020 Archived combined filters1/2 completed
    - group [ref=f7e427]:
      - button "Open project" [ref=f7e428]
    - group [ref=f7e430]:
      - button "Archive project" [ref=f7e431]
  - generic [ref=f7e432]:
    - text: task-020 Priority ownership0/2 completed
    - group [ref=f7e434]:
      - button "Open project" [ref=f7e435]
    - group [ref=f7e437]:
      - button "Archive project" [ref=f7e438]
  - generic [ref=f7e439]:
    - text: task-020 Priority other owner0/1 completed
    - group [ref=f7e441]:
      - button "Open project" [ref=f7e442]
    - group [ref=f7e444]:
      - button "Archive project" [ref=f7e445]
  - generic [ref=f7e446]:
    - text: task-020 Priority completion1/2 completed
    - group [ref=f7e448]:
      - button "Open project" [ref=f7e449]
    - group [ref=f7e451]:
      - button "Archive project" [ref=f7e452]
  - generic [ref=f7e453]:
    - text: task-020 Priority archive0/1 completed
    - group [ref=f7e455]:
      - button "Open project" [ref=f7e456]
    - group [ref=f7e458]:
      - button "Archive project" [ref=f7e459]
  - generic [ref=f7e460]:
    - text: task-020 Return holding0/0 completed
    - group [ref=f7e462]:
      - button "Open project" [ref=f7e463]
    - group [ref=f7e465]:
      - button "Archive project" [ref=f7e466]
  - generic [ref=f7e467]:
    - text: task-020 Return owner1/4 completed
    - group [ref=f7e469]:
      - button "Open project" [ref=f7e470]
    - group [ref=f7e472]:
      - button "Archive project" [ref=f7e473]
  - generic [ref=f7e474]:
    - text: task-020 Return identity holding0/0 completed
    - group [ref=f7e476]:
      - button "Open project" [ref=f7e477]
    - group [ref=f7e479]:
      - button "Archive project" [ref=f7e480]
  - generic [ref=f7e481]:
    - text: task-020 Returned owner renamed0/3 completed
    - group [ref=f7e483]:
      - button "Open project" [ref=f7e484]
    - group [ref=f7e486]:
      - button "Archive project" [ref=f7e487]
  - generic [ref=f7e488]:
    - text: task-020 Position second owner0/2 completed
    - group [ref=f7e490]:
      - button "Open project" [ref=f7e491]
    - group [ref=f7e493]:
      - button "Archive project" [ref=f7e494]
  - generic [ref=f7e495]:
    - text: task-020 Position third owner0/0 completed
    - group [ref=f7e497]:
      - button "Open project" [ref=f7e498]
    - group [ref=f7e500]:
      - button "Archive project" [ref=f7e501]
  - generic [ref=f7e502]:
    - text: task-020 Position first owner0/4 completed
    - group [ref=f7e504]:
      - button "Open project" [ref=f7e505]
    - group [ref=f7e507]:
      - button "Archive project" [ref=f7e508]
  - generic [ref=f7e509]:
    - text: task-020 Whitespace retained owner0/2 completed
    - group [ref=f7e511]:
      - button "Open project" [ref=f7e512]
    - group [ref=f7e514]:
      - button "Archive project" [ref=f7e515]
  - generic [ref=f7e516]:
    - text: task-020 Whitespace Saved first0/0 completed
    - group [ref=f7e518]:
      - button "Open project" [ref=f7e519]
    - group [ref=f7e521]:
      - button "Archive project" [ref=f7e522]
  - generic [ref=f7e523]:
    - text: task-020 Whitespace Saved second0/0 completed
    - group [ref=f7e525]:
      - button "Open project" [ref=f7e526]
    - group [ref=f7e528]:
      - button "Archive project" [ref=f7e529]
  - generic [ref=f7e530]:
    - text: task-020 Whitespace unrelated sentinel0/0 completed
    - group [ref=f7e532]:
      - button "Open project" [ref=f7e533]
    - group [ref=f7e535]:
      - button "Archive project" [ref=f7e536]
  - generic [ref=f7e537]:
    - text: task-020 Search Mixed first0/0 completed
    - group [ref=f7e539]:
      - button "Open project" [ref=f7e540]
    - group [ref=f7e542]:
      - button "Archive project" [ref=f7e543]
  - generic [ref=f7e544]:
    - text: task-020 Search unrelated0/0 completed
    - group [ref=f7e546]:
      - button "Open project" [ref=f7e547]
    - group [ref=f7e549]:
      - button "Archive project" [ref=f7e550]
  - generic [ref=f7e551]:
    - text: task-020 Search mixed last0/0 completed
    - group [ref=f7e553]:
      - button "Open project" [ref=f7e554]
    - group [ref=f7e556]:
      - button "Archive project" [ref=f7e557]
  - generic [ref=f7e558]:
    - text: task-020 Search double gap0/0 completed
    - group [ref=f7e560]:
      - button "Open project" [ref=f7e561]
    - group [ref=f7e563]:
      - button "Archive project" [ref=f7e564]
  - generic [ref=f7e565]:
    - text: task-020 Search double sentinel0/0 completed
    - group [ref=f7e567]:
      - button "Open project" [ref=f7e568]
    - group [ref=f7e570]:
      - button "Archive project" [ref=f7e571]
  - generic [ref=f7e572]:
    - text: task-020 Search task intersections1/6 completed
    - group [ref=f7e574]:
      - button "Open project" [ref=f7e575]
    - group [ref=f7e577]:
      - button "Archive project" [ref=f7e578]
  - generic [ref=f7e579]:
    - text: task-020 Search internal spacing0/2 completed
    - group [ref=f7e581]:
      - button "Open project" [ref=f7e582]
    - group [ref=f7e584]:
      - button "Archive project" [ref=f7e585]
  - generic [ref=f7e586]:
    - text: task-020 Alpha create0/0 completed
    - group [ref=f7e588]:
      - button "Open project" [ref=f7e589]
    - group [ref=f7e591]:
      - button "Archive project" [ref=f7e592]
  - generic [ref=f7e593]:
    - text: task-020 Blank validation sentinel0/0 completed
    - group [ref=f7e595]:
      - button "Open project" [ref=f7e596]
    - group [ref=f7e598]:
      - button "Archive project" [ref=f7e599]
  - generic [ref=f7e600]:
    - text: task-020 Order first0/0 completed
    - group [ref=f7e602]:
      - button "Open project" [ref=f7e603]
    - group [ref=f7e605]:
      - button "Archive project" [ref=f7e606]
  - generic [ref=f7e607]:
    - text: task-020 Order second0/0 completed
    - group [ref=f7e609]:
      - button "Open project" [ref=f7e610]
    - group [ref=f7e612]:
      - button "Archive project" [ref=f7e613]
  - generic [ref=f7e614]:
    - text: task-020 Task reload0/1 completed
    - group [ref=f7e616]:
      - button "Open project" [ref=f7e617]
    - group [ref=f7e619]:
      - button "Archive project" [ref=f7e620]
  - generic [ref=f7e621]:
    - text: task-020 Task invalid0/0 completed
    - group [ref=f7e623]:
      - button "Open project" [ref=f7e624]
    - group [ref=f7e626]:
      - button "Archive project" [ref=f7e627]
  - generic [ref=f7e628]:
    - text: task-020 Task owner0/1 completed
    - group [ref=f7e630]:
      - button "Open project" [ref=f7e631]
    - group [ref=f7e633]:
      - button "Archive project" [ref=f7e634]
  - generic [ref=f7e635]:
    - text: task-020 Other project0/0 completed
    - group [ref=f7e637]:
      - button "Open project" [ref=f7e638]
    - group [ref=f7e640]:
      - button "Archive project" [ref=f7e641]
  - generic [ref=f7e642]:
    - text: task-020 Task filters0/2 completed
    - group [ref=f7e644]:
      - button "Open project" [ref=f7e645]
    - group [ref=f7e647]:
      - button "Archive project" [ref=f7e648]
  - generic [ref=f7e649]:
    - text: task-020 Archive lifecycle0/0 completed
    - group [ref=f7e651]:
      - button "Open project" [ref=f7e652]
    - group [ref=f7e654]:
      - button "Archive project" [ref=f7e655]
  - generic [ref=f7e656]:
    - text: task-020 Archive tasks1/1 completed
    - group [ref=f7e658]:
      - button "Open project" [ref=f7e659]
    - group [ref=f7e661]:
      - button "Archive project" [ref=f7e662]
  - generic [ref=f7e663]:
    - text: task-020 Summary project1/2 completed
    - group [ref=f7e665]:
      - button "Open project" [ref=f7e666]
    - group [ref=f7e668]:
      - button "Archive project" [ref=f7e669]
  - generic [ref=f7e670]:
    - text: task-020 Transfer restart origin0/0 completed
    - group [ref=f7e672]:
      - button "Open project" [ref=f7e673]
    - group [ref=f7e675]:
      - button "Archive project" [ref=f7e676]
  - generic [ref=f7e677]:
    - text: task-020 Identity updated1/1 completed
    - group [ref=f7e679]:
      - button "Open project" [ref=f7e680]
    - group [ref=f7e682]:
      - button "Archive project" [ref=f7e683]
  - generic [ref=f7e684]:
    - text: task-020 Identity second0/0 completed
    - group [ref=f7e686]:
      - button "Open project" [ref=f7e687]
    - group [ref=f7e689]:
      - button "Archive project" [ref=f7e690]
  - generic [ref=f7e691]:
    - text: task-020 Rename invalid0/0 completed
    - group [ref=f7e693]:
      - button "Open project" [ref=f7e694]
    - group [ref=f7e696]:
      - button "Archive project" [ref=f7e697]
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