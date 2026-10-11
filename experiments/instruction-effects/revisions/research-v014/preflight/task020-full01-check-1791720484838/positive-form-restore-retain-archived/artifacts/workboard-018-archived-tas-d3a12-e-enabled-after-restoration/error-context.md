# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 018 archived task rename controls become enabled after restoration
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/workboard.spec.mjs:296:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Task rename archive' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f10e1]:
  - heading "Workboard" [level=1] [ref=f10e2]
  - group [ref=f10e4]:
    - button "Task directory" [ref=f10e5]
  - group [ref=f10e7]:
    - generic [ref=f10e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f10e9]
    - generic [ref=f10e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f10e11]
    - button "Import project" [ref=f10e12]
  - group [ref=f10e14]:
    - generic [ref=f10e15]:
      - text: Project name
      - textbox "Project name" [ref=f10e16]
    - button "Create project" [ref=f10e17]
  - group [ref=f10e19]:
    - generic [ref=f10e20]:
      - text: Project search
      - textbox "Project search" [ref=f10e21]
    - button "Search projects" [ref=f10e22]
  - generic [ref=f10e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f10e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f10e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f10e28]:
      - button "Open project" [ref=f10e29]
    - group [ref=f10e31]:
      - button "Archive project" [ref=f10e32]
  - generic [ref=f10e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f10e35]:
      - button "Open project" [ref=f10e36]
    - group [ref=f10e38]:
      - button "Archive project" [ref=f10e39]
  - generic [ref=f10e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f10e42]:
      - button "Open project" [ref=f10e43]
    - group [ref=f10e45]:
      - button "Archive project" [ref=f10e46]
  - generic [ref=f10e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f10e49]:
      - button "Open project" [ref=f10e50]
    - group [ref=f10e52]:
      - button "Archive project" [ref=f10e53]
  - generic [ref=f10e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f10e56]:
      - button "Open project" [ref=f10e57]
    - group [ref=f10e59]:
      - button "Archive project" [ref=f10e60]
  - generic [ref=f10e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f10e63]:
      - button "Open project" [ref=f10e64]
    - group [ref=f10e66]:
      - button "Archive project" [ref=f10e67]
  - generic [ref=f10e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f10e70]:
      - button "Open project" [ref=f10e71]
    - group [ref=f10e73]:
      - button "Archive project" [ref=f10e74]
  - generic [ref=f10e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f10e77]:
      - button "Open project" [ref=f10e78]
    - group [ref=f10e80]:
      - button "Archive project" [ref=f10e81]
  - generic [ref=f10e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f10e84]:
      - button "Open project" [ref=f10e85]
    - group [ref=f10e87]:
      - button "Archive project" [ref=f10e88]
  - generic [ref=f10e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f10e91]:
      - button "Open project" [ref=f10e92]
    - group [ref=f10e94]:
      - button "Archive project" [ref=f10e95]
  - generic [ref=f10e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f10e98]:
      - button "Open project" [ref=f10e99]
    - group [ref=f10e101]:
      - button "Archive project" [ref=f10e102]
  - generic [ref=f10e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f10e105]:
      - button "Open project" [ref=f10e106]
    - group [ref=f10e108]:
      - button "Archive project" [ref=f10e109]
  - generic [ref=f10e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f10e112]:
      - button "Open project" [ref=f10e113]
    - group [ref=f10e115]:
      - button "Archive project" [ref=f10e116]
  - generic [ref=f10e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f10e119]:
      - button "Open project" [ref=f10e120]
    - group [ref=f10e122]:
      - button "Archive project" [ref=f10e123]
  - generic [ref=f10e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f10e126]:
      - button "Open project" [ref=f10e127]
    - group [ref=f10e129]:
      - button "Archive project" [ref=f10e130]
  - generic [ref=f10e131]:
    - text: task-020 Deletion fields4/6 completed
    - group [ref=f10e133]:
      - button "Open project" [ref=f10e134]
    - group [ref=f10e136]:
      - button "Archive project" [ref=f10e137]
  - generic [ref=f10e138]:
    - text: task-020 Deletion target1/3 completed
    - group [ref=f10e140]:
      - button "Open project" [ref=f10e141]
    - group [ref=f10e143]:
      - button "Archive project" [ref=f10e144]
  - generic [ref=f10e145]:
    - text: task-020 Deletion order0/3 completed
    - group [ref=f10e147]:
      - button "Open project" [ref=f10e148]
    - group [ref=f10e150]:
      - button "Archive project" [ref=f10e151]
  - generic [ref=f10e152]:
    - text: task-020 Deletion restart0/0 completed
    - group [ref=f10e154]:
      - button "Open project" [ref=f10e155]
    - group [ref=f10e157]:
      - button "Archive project" [ref=f10e158]
  - generic [ref=f10e159]:
    - text: task-020 Deleted intersections0/0 completed
    - group [ref=f10e161]:
      - button "Open project" [ref=f10e162]
    - group [ref=f10e164]:
      - button "Archive project" [ref=f10e165]
  - generic [ref=f10e166]:
    - text: task-020 Directory Zulu owner1/3 completed
    - group [ref=f10e168]:
      - button "Open project" [ref=f10e169]
    - group [ref=f10e171]:
      - button "Archive project" [ref=f10e172]
  - generic [ref=f10e173]:
    - text: task-020 Directory Alpha owner0/1 completed
    - group [ref=f10e175]:
      - button "Open project" [ref=f10e176]
    - group [ref=f10e178]:
      - button "Archive project" [ref=f10e179]
  - generic [ref=f10e180]:
    - text: task-020 Directory filter owner1/5 completed
    - group [ref=f10e182]:
      - button "Open project" [ref=f10e183]
    - group [ref=f10e185]:
      - button "Archive project" [ref=f10e186]
  - generic [ref=f10e187]:
    - text: task-020 Directory whitespace0/1 completed
    - group [ref=f10e189]:
      - button "Open project" [ref=f10e190]
    - group [ref=f10e192]:
      - button "Archive project" [ref=f10e193]
  - generic [ref=f10e194]:
    - text: task-020 Calendar persistence0/1 completed
    - group [ref=f10e196]:
      - button "Open project" [ref=f10e197]
    - group [ref=f10e199]:
      - button "Archive project" [ref=f10e200]
  - generic [ref=f10e201]:
    - text: task-020 Calendar validation0/1 completed
    - group [ref=f10e203]:
      - button "Open project" [ref=f10e204]
    - group [ref=f10e206]:
      - button "Archive project" [ref=f10e207]
  - generic [ref=f10e208]:
    - text: task-020 Calendar independence2/3 completed
    - group [ref=f10e210]:
      - button "Open project" [ref=f10e211]
    - group [ref=f10e213]:
      - button "Archive project" [ref=f10e214]
  - generic [ref=f10e215]:
    - text: task-020 Calendar second owner0/1 completed
    - group [ref=f10e217]:
      - button "Open project" [ref=f10e218]
    - group [ref=f10e220]:
      - button "Archive project" [ref=f10e221]
  - generic [ref=f10e222]:
    - text: task-020 Calendar archival0/1 completed
    - group [ref=f10e224]:
      - button "Open project" [ref=f10e225]
    - group [ref=f10e227]:
      - button "Archive project" [ref=f10e228]
  - generic [ref=f10e229]:
    - text: task-020 Range boundaries0/5 completed
    - group [ref=f10e231]:
      - button "Open project" [ref=f10e232]
    - group [ref=f10e234]:
      - button "Archive project" [ref=f10e235]
  - generic [ref=f10e236]:
    - text: task-020 Range intersections0/4 completed
    - group [ref=f10e238]:
      - button "Open project" [ref=f10e239]
    - group [ref=f10e241]:
      - button "Archive project" [ref=f10e242]
  - generic [ref=f10e243]:
    - text: task-020 Range validation0/2 completed
    - group [ref=f10e245]:
      - button "Open project" [ref=f10e246]
    - group [ref=f10e248]:
      - button "Archive project" [ref=f10e249]
  - generic [ref=f10e250]:
    - text: task-020 Range archival0/2 completed
    - group [ref=f10e252]:
      - button "Open project" [ref=f10e253]
    - group [ref=f10e255]:
      - button "Archive project" [ref=f10e256]
  - generic [ref=f10e257]:
    - text: task-020 Range owner renamed0/3 completed
    - group [ref=f10e259]:
      - button "Open project" [ref=f10e260]
    - group [ref=f10e262]:
      - button "Archive project" [ref=f10e263]
  - generic [ref=f10e264]:
    - text: task-020 Export foreign0/1 completed
    - group [ref=f10e266]:
      - button "Open project" [ref=f10e267]
    - group [ref=f10e269]:
      - button "Archive project" [ref=f10e270]
  - generic [ref=f10e271]:
    - text: task-020 Export full Ω0/2 completed
    - group [ref=f10e273]:
      - button "Open project" [ref=f10e274]
    - group [ref=f10e276]:
      - button "Archive project" [ref=f10e277]
  - generic [ref=f10e278]:
    - text: task-020 Export empty0/0 completed
    - group [ref=f10e280]:
      - button "Open project" [ref=f10e281]
    - group [ref=f10e283]:
      - button "Archive project" [ref=f10e284]
  - generic [ref=f10e285]:
    - text: task-020 Import origin0/2 completed
    - group [ref=f10e287]:
      - button "Open project" [ref=f10e288]
    - group [ref=f10e290]:
      - button "Archive project" [ref=f10e291]
  - generic [ref=f10e292]:
    - text: task-020 Import copy1/4 completed
    - group [ref=f10e294]:
      - button "Open project" [ref=f10e295]
    - group [ref=f10e297]:
      - button "Archive project" [ref=f10e298]
  - generic [ref=f10e299]:
    - text: task-020 Parse guard existing0/1 completed
    - group [ref=f10e301]:
      - button "Open project" [ref=f10e302]
    - group [ref=f10e304]:
      - button "Archive project" [ref=f10e305]
  - generic [ref=f10e306]:
    - text: task-020 Task guard existing0/1 completed
    - group [ref=f10e308]:
      - button "Open project" [ref=f10e309]
    - group [ref=f10e311]:
      - button "Archive project" [ref=f10e312]
  - generic [ref=f10e313]:
    - text: task-020 Import restart0/1 completed
    - group [ref=f10e315]:
      - button "Open project" [ref=f10e316]
    - group [ref=f10e318]:
      - button "Archive project" [ref=f10e319]
  - generic [ref=f10e320]:
    - text: task-020 Transfer target1/3 completed
    - group [ref=f10e322]:
      - button "Open project" [ref=f10e323]
    - group [ref=f10e325]:
      - button "Archive project" [ref=f10e326]
  - generic [ref=f10e327]:
    - text: task-020 Transfer source0/1 completed
    - group [ref=f10e329]:
      - button "Open project" [ref=f10e330]
    - group [ref=f10e332]:
      - button "Archive project" [ref=f10e333]
  - generic [ref=f10e334]:
    - text: task-020 Filtered transfer target0/2 completed
    - group [ref=f10e336]:
      - button "Open project" [ref=f10e337]
    - group [ref=f10e339]:
      - button "Archive project" [ref=f10e340]
  - generic [ref=f10e341]:
    - text: task-020 Filtered transfer source1/5 completed
    - group [ref=f10e343]:
      - button "Open project" [ref=f10e344]
    - group [ref=f10e346]:
      - button "Archive project" [ref=f10e347]
  - generic [ref=f10e348]:
    - text: task-020 Options first0/0 completed
    - group [ref=f10e350]:
      - button "Open project" [ref=f10e351]
    - group [ref=f10e353]:
      - button "Archive project" [ref=f10e354]
  - generic [ref=f10e355]:
    - text: task-020 Options second0/0 completed
    - group [ref=f10e357]:
      - button "Open project" [ref=f10e358]
    - group [ref=f10e360]:
      - button "Archive project" [ref=f10e361]
  - generic [ref=f10e362]:
    - text: task-020 Options owner0/1 completed
    - group [ref=f10e364]:
      - button "Open project" [ref=f10e365]
    - group [ref=f10e367]:
      - button "Archive project" [ref=f10e368]
  - generic [ref=f10e369]:
    - text: task-020 Read-only transfer target0/1 completed
    - group [ref=f10e371]:
      - button "Open project" [ref=f10e372]
    - group [ref=f10e374]:
      - button "Archive project" [ref=f10e375]
  - generic [ref=f10e376]:
    - text: task-020 Read-only transfer owner0/2 completed
    - group [ref=f10e378]:
      - button "Open project" [ref=f10e379]
    - group [ref=f10e381]:
      - button "Archive project" [ref=f10e382]
  - generic [ref=f10e383]:
    - text: task-020 Notes values0/2 completed
    - group [ref=f10e385]:
      - button "Open project" [ref=f10e386]
    - group [ref=f10e388]:
      - button "Archive project" [ref=f10e389]
  - generic [ref=f10e390]:
    - text: task-020 Notes target0/1 completed
    - group [ref=f10e392]:
      - button "Open project" [ref=f10e393]
    - group [ref=f10e395]:
      - button "Archive project" [ref=f10e396]
  - generic [ref=f10e397]:
    - text: task-020 Notes owner0/3 completed
    - group [ref=f10e399]:
      - button "Open project" [ref=f10e400]
    - group [ref=f10e402]:
      - button "Archive project" [ref=f10e403]
  - generic [ref=f10e404]:
    - text: task-020 Priority intersection1/4 completed
    - group [ref=f10e406]:
      - button "Open project" [ref=f10e407]
    - group [ref=f10e409]:
      - button "Archive project" [ref=f10e410]
  - generic [ref=f10e411]:
    - text: task-020 Priority live filters1/4 completed
    - group [ref=f10e413]:
      - button "Open project" [ref=f10e414]
    - group [ref=f10e416]:
      - button "Archive project" [ref=f10e417]
  - generic [ref=f10e418]:
    - text: task-020 Priority rename filters1/3 completed
    - group [ref=f10e420]:
      - button "Open project" [ref=f10e421]
    - group [ref=f10e423]:
      - button "Archive project" [ref=f10e424]
  - generic [ref=f10e425]:
    - text: task-020 Archived combined filters1/2 completed
    - group [ref=f10e427]:
      - button "Open project" [ref=f10e428]
    - group [ref=f10e430]:
      - button "Archive project" [ref=f10e431]
  - generic [ref=f10e432]:
    - text: task-020 Priority ownership0/2 completed
    - group [ref=f10e434]:
      - button "Open project" [ref=f10e435]
    - group [ref=f10e437]:
      - button "Archive project" [ref=f10e438]
  - generic [ref=f10e439]:
    - text: task-020 Priority other owner0/1 completed
    - group [ref=f10e441]:
      - button "Open project" [ref=f10e442]
    - group [ref=f10e444]:
      - button "Archive project" [ref=f10e445]
  - generic [ref=f10e446]:
    - text: task-020 Priority completion1/2 completed
    - group [ref=f10e448]:
      - button "Open project" [ref=f10e449]
    - group [ref=f10e451]:
      - button "Archive project" [ref=f10e452]
  - generic [ref=f10e453]:
    - text: task-020 Priority archive0/1 completed
    - group [ref=f10e455]:
      - button "Open project" [ref=f10e456]
    - group [ref=f10e458]:
      - button "Archive project" [ref=f10e459]
  - generic [ref=f10e460]:
    - text: task-020 Return holding0/0 completed
    - group [ref=f10e462]:
      - button "Open project" [ref=f10e463]
    - group [ref=f10e465]:
      - button "Archive project" [ref=f10e466]
  - generic [ref=f10e467]:
    - text: task-020 Return owner1/4 completed
    - group [ref=f10e469]:
      - button "Open project" [ref=f10e470]
    - group [ref=f10e472]:
      - button "Archive project" [ref=f10e473]
  - generic [ref=f10e474]:
    - text: task-020 Return identity holding0/0 completed
    - group [ref=f10e476]:
      - button "Open project" [ref=f10e477]
    - group [ref=f10e479]:
      - button "Archive project" [ref=f10e480]
  - generic [ref=f10e481]:
    - text: task-020 Returned owner renamed0/3 completed
    - group [ref=f10e483]:
      - button "Open project" [ref=f10e484]
    - group [ref=f10e486]:
      - button "Archive project" [ref=f10e487]
  - generic [ref=f10e488]:
    - text: task-020 Position second owner0/2 completed
    - group [ref=f10e490]:
      - button "Open project" [ref=f10e491]
    - group [ref=f10e493]:
      - button "Archive project" [ref=f10e494]
  - generic [ref=f10e495]:
    - text: task-020 Position third owner0/0 completed
    - group [ref=f10e497]:
      - button "Open project" [ref=f10e498]
    - group [ref=f10e500]:
      - button "Archive project" [ref=f10e501]
  - generic [ref=f10e502]:
    - text: task-020 Position first owner0/4 completed
    - group [ref=f10e504]:
      - button "Open project" [ref=f10e505]
    - group [ref=f10e507]:
      - button "Archive project" [ref=f10e508]
  - generic [ref=f10e509]:
    - text: task-020 Whitespace retained owner0/2 completed
    - group [ref=f10e511]:
      - button "Open project" [ref=f10e512]
    - group [ref=f10e514]:
      - button "Archive project" [ref=f10e515]
  - generic [ref=f10e516]:
    - text: task-020 Whitespace Saved first0/0 completed
    - group [ref=f10e518]:
      - button "Open project" [ref=f10e519]
    - group [ref=f10e521]:
      - button "Archive project" [ref=f10e522]
  - generic [ref=f10e523]:
    - text: task-020 Whitespace Saved second0/0 completed
    - group [ref=f10e525]:
      - button "Open project" [ref=f10e526]
    - group [ref=f10e528]:
      - button "Archive project" [ref=f10e529]
  - generic [ref=f10e530]:
    - text: task-020 Whitespace unrelated sentinel0/0 completed
    - group [ref=f10e532]:
      - button "Open project" [ref=f10e533]
    - group [ref=f10e535]:
      - button "Archive project" [ref=f10e536]
  - generic [ref=f10e537]:
    - text: task-020 Search Mixed first0/0 completed
    - group [ref=f10e539]:
      - button "Open project" [ref=f10e540]
    - group [ref=f10e542]:
      - button "Archive project" [ref=f10e543]
  - generic [ref=f10e544]:
    - text: task-020 Search unrelated0/0 completed
    - group [ref=f10e546]:
      - button "Open project" [ref=f10e547]
    - group [ref=f10e549]:
      - button "Archive project" [ref=f10e550]
  - generic [ref=f10e551]:
    - text: task-020 Search mixed last0/0 completed
    - group [ref=f10e553]:
      - button "Open project" [ref=f10e554]
    - group [ref=f10e556]:
      - button "Archive project" [ref=f10e557]
  - generic [ref=f10e558]:
    - text: task-020 Search double gap0/0 completed
    - group [ref=f10e560]:
      - button "Open project" [ref=f10e561]
    - group [ref=f10e563]:
      - button "Archive project" [ref=f10e564]
  - generic [ref=f10e565]:
    - text: task-020 Search double sentinel0/0 completed
    - group [ref=f10e567]:
      - button "Open project" [ref=f10e568]
    - group [ref=f10e570]:
      - button "Archive project" [ref=f10e571]
  - generic [ref=f10e572]:
    - text: task-020 Search task intersections1/6 completed
    - group [ref=f10e574]:
      - button "Open project" [ref=f10e575]
    - group [ref=f10e577]:
      - button "Archive project" [ref=f10e578]
  - generic [ref=f10e579]:
    - text: task-020 Search internal spacing0/2 completed
    - group [ref=f10e581]:
      - button "Open project" [ref=f10e582]
    - group [ref=f10e584]:
      - button "Archive project" [ref=f10e585]
  - generic [ref=f10e586]:
    - text: task-020 Alpha create0/0 completed
    - group [ref=f10e588]:
      - button "Open project" [ref=f10e589]
    - group [ref=f10e591]:
      - button "Archive project" [ref=f10e592]
  - generic [ref=f10e593]:
    - text: task-020 Blank validation sentinel0/0 completed
    - group [ref=f10e595]:
      - button "Open project" [ref=f10e596]
    - group [ref=f10e598]:
      - button "Archive project" [ref=f10e599]
  - generic [ref=f10e600]:
    - text: task-020 Order first0/0 completed
    - group [ref=f10e602]:
      - button "Open project" [ref=f10e603]
    - group [ref=f10e605]:
      - button "Archive project" [ref=f10e606]
  - generic [ref=f10e607]:
    - text: task-020 Order second0/0 completed
    - group [ref=f10e609]:
      - button "Open project" [ref=f10e610]
    - group [ref=f10e612]:
      - button "Archive project" [ref=f10e613]
  - generic [ref=f10e614]:
    - text: task-020 Task reload0/1 completed
    - group [ref=f10e616]:
      - button "Open project" [ref=f10e617]
    - group [ref=f10e619]:
      - button "Archive project" [ref=f10e620]
  - generic [ref=f10e621]:
    - text: task-020 Task invalid0/0 completed
    - group [ref=f10e623]:
      - button "Open project" [ref=f10e624]
    - group [ref=f10e626]:
      - button "Archive project" [ref=f10e627]
  - generic [ref=f10e628]:
    - text: task-020 Task owner0/1 completed
    - group [ref=f10e630]:
      - button "Open project" [ref=f10e631]
    - group [ref=f10e633]:
      - button "Archive project" [ref=f10e634]
  - generic [ref=f10e635]:
    - text: task-020 Other project0/0 completed
    - group [ref=f10e637]:
      - button "Open project" [ref=f10e638]
    - group [ref=f10e640]:
      - button "Archive project" [ref=f10e641]
  - generic [ref=f10e642]:
    - text: task-020 Task filters0/2 completed
    - group [ref=f10e644]:
      - button "Open project" [ref=f10e645]
    - group [ref=f10e647]:
      - button "Archive project" [ref=f10e648]
  - generic [ref=f10e649]:
    - text: task-020 Archive lifecycle0/0 completed
    - group [ref=f10e651]:
      - button "Open project" [ref=f10e652]
    - group [ref=f10e654]:
      - button "Archive project" [ref=f10e655]
  - generic [ref=f10e656]:
    - text: task-020 Archive tasks1/1 completed
    - group [ref=f10e658]:
      - button "Open project" [ref=f10e659]
    - group [ref=f10e661]:
      - button "Archive project" [ref=f10e662]
  - generic [ref=f10e663]:
    - text: task-020 Summary project1/2 completed
    - group [ref=f10e665]:
      - button "Open project" [ref=f10e666]
    - group [ref=f10e668]:
      - button "Archive project" [ref=f10e669]
  - generic [ref=f10e670]:
    - text: task-020 Transfer restart origin0/0 completed
    - group [ref=f10e672]:
      - button "Open project" [ref=f10e673]
    - group [ref=f10e675]:
      - button "Archive project" [ref=f10e676]
  - generic [ref=f10e677]:
    - text: task-020 Identity updated1/1 completed
    - group [ref=f10e679]:
      - button "Open project" [ref=f10e680]
    - group [ref=f10e682]:
      - button "Archive project" [ref=f10e683]
  - generic [ref=f10e684]:
    - text: task-020 Identity second0/0 completed
    - group [ref=f10e686]:
      - button "Open project" [ref=f10e687]
    - group [ref=f10e689]:
      - button "Archive project" [ref=f10e690]
  - generic [ref=f10e691]:
    - text: task-020 Rename invalid0/0 completed
    - group [ref=f10e693]:
      - button "Open project" [ref=f10e694]
    - group [ref=f10e696]:
      - button "Archive project" [ref=f10e697]
  - generic [ref=f10e698]:
    - text: task-020 Rename archive0/0 completed
    - group [ref=f10e700]:
      - button "Open project" [ref=f10e701]
    - group [ref=f10e703]:
      - button "Archive project" [ref=f10e704]
  - generic [ref=f10e705]:
    - text: task-020 Task rename identity1/2 completed
    - group [ref=f10e707]:
      - button "Open project" [ref=f10e708]
    - group [ref=f10e710]:
      - button "Archive project" [ref=f10e711]
  - generic [ref=f10e712]:
    - text: task-020 Task rename invalid0/1 completed
    - group [ref=f10e714]:
      - button "Open project" [ref=f10e715]
    - group [ref=f10e717]:
      - button "Archive project" [ref=f10e718]
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