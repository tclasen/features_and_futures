# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-default.spec.mjs >> 127 every bulk action honors owner default and preserves defaults and nonmatching tasks
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task040-full-prototype-suite/directory-project-default.spec.mjs:18:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-040 Owner bulk high' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-040 Owner bulk high' }).visible() resolved to 2 elements:
    1) <div data-testid="project-row">…</div> aka getByText('task-040 Owner bulk high0/2')
    2) <div data-testid="project-row">…</div> aka getByText('task-040 Owner bulk high0/0')

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-040 Owner bulk high' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-040 Owner bulk high' }).visible()

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - heading "Workboard" [level=1] [ref=f1e2]
  - group [ref=f1e4]:
    - button "Task directory" [ref=f1e5]
  - group [ref=f1e7]:
    - generic [ref=f1e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f1e9]
    - generic [ref=f1e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f1e11]
    - button "Import project" [ref=f1e12]
  - group [ref=f1e14]:
    - generic [ref=f1e15]:
      - text: Workspace JSON
      - textbox "Workspace JSON" [ref=f1e16]
    - button "Import workspace" [ref=f1e17]
  - group [ref=f1e19]:
    - generic [ref=f1e20]:
      - text: Project name
      - textbox "Project name" [ref=f1e21]
    - button "Create project" [ref=f1e22]
  - group [ref=f1e24]:
    - generic [ref=f1e25]:
      - text: Project search
      - textbox "Project search" [ref=f1e26]
    - button "Search projects" [ref=f1e27]
  - generic [ref=f1e29]:
    - text: Project filter
    - combobox "Project filter" [ref=f1e30]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f1e31]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f1e33]:
      - button "Open project" [ref=f1e34]
    - group [ref=f1e36]:
      - button "Archive project" [ref=f1e37]
  - generic [ref=f1e38]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f1e40]:
      - button "Open project" [ref=f1e41]
    - group [ref=f1e43]:
      - button "Archive project" [ref=f1e44]
  - generic [ref=f1e45]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f1e47]:
      - button "Open project" [ref=f1e48]
    - group [ref=f1e50]:
      - button "Archive project" [ref=f1e51]
  - generic [ref=f1e52]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f1e54]:
      - button "Open project" [ref=f1e55]
    - group [ref=f1e57]:
      - button "Archive project" [ref=f1e58]
  - generic [ref=f1e59]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f1e61]:
      - button "Open project" [ref=f1e62]
    - group [ref=f1e64]:
      - button "Archive project" [ref=f1e65]
  - generic [ref=f1e66]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f1e68]:
      - button "Open project" [ref=f1e69]
    - group [ref=f1e71]:
      - button "Archive project" [ref=f1e72]
  - generic [ref=f1e73]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f1e75]:
      - button "Open project" [ref=f1e76]
    - group [ref=f1e78]:
      - button "Archive project" [ref=f1e79]
  - generic [ref=f1e80]:
    - text: task-032 Legacy title owner0/1 completed
    - group [ref=f1e82]:
      - button "Open project" [ref=f1e83]
    - group [ref=f1e85]:
      - button "Archive project" [ref=f1e86]
  - generic [ref=f1e87]:
    - text: task-031 Legacy project name 😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀0/1 completed
    - group [ref=f1e89]:
      - button "Open project" [ref=f1e90]
    - group [ref=f1e92]:
      - button "Archive project" [ref=f1e93]
  - generic [ref=f1e94]:
    - text: task-040 Bulk first owner0/7 completed
    - group [ref=f1e96]:
      - button "Open project" [ref=f1e97]
    - group [ref=f1e99]:
      - button "Archive project" [ref=f1e100]
  - generic [ref=f1e101]:
    - text: task-040 Bulk second owner0/2 completed
    - group [ref=f1e103]:
      - button "Open project" [ref=f1e104]
    - group [ref=f1e106]:
      - button "Archive project" [ref=f1e107]
  - generic [ref=f1e108]:
    - text: task-040 Bulk protected1/1 completed
    - group [ref=f1e110]:
      - button "Open project" [ref=f1e111]
    - group [ref=f1e113]:
      - button "Archive project" [ref=f1e114]
  - generic [ref=f1e115]:
    - text: task-040 Bulk restart first1/1 completed
    - group [ref=f1e117]:
      - button "Open project" [ref=f1e118]
    - group [ref=f1e120]:
      - button "Archive project" [ref=f1e121]
  - generic [ref=f1e122]:
    - text: task-040 Bulk restart second1/1 completed
    - group [ref=f1e124]:
      - button "Open project" [ref=f1e125]
    - group [ref=f1e127]:
      - button "Archive project" [ref=f1e128]
  - generic [ref=f1e129]:
    - text: task-040 Defaults independent0/1 completed
    - group [ref=f1e131]:
      - button "Open project" [ref=f1e132]
    - group [ref=f1e134]:
      - button "Archive project" [ref=f1e135]
  - generic [ref=f1e136]:
    - text: task-040 Defaults inheritance1/4 completed
    - group [ref=f1e138]:
      - button "Open project" [ref=f1e139]
    - group [ref=f1e141]:
      - button "Archive project" [ref=f1e142]
  - generic [ref=f1e143]:
    - text: task-040 Defaults renamed0/2 completed
    - group [ref=f1e145]:
      - button "Open project" [ref=f1e146]
    - group [ref=f1e148]:
      - button "Archive project" [ref=f1e149]
  - generic [ref=f1e150]:
    - text: task-040 Deletion fields4/6 completed
    - group [ref=f1e152]:
      - button "Open project" [ref=f1e153]
    - group [ref=f1e155]:
      - button "Archive project" [ref=f1e156]
  - generic [ref=f1e157]:
    - text: task-040 Deletion target1/3 completed
    - group [ref=f1e159]:
      - button "Open project" [ref=f1e160]
    - group [ref=f1e162]:
      - button "Archive project" [ref=f1e163]
  - generic [ref=f1e164]:
    - text: task-040 Deletion order0/3 completed
    - group [ref=f1e166]:
      - button "Open project" [ref=f1e167]
    - group [ref=f1e169]:
      - button "Archive project" [ref=f1e170]
  - generic [ref=f1e171]:
    - text: task-040 Deletion restart0/0 completed
    - group [ref=f1e173]:
      - button "Open project" [ref=f1e174]
    - group [ref=f1e176]:
      - button "Archive project" [ref=f1e177]
  - generic [ref=f1e178]:
    - text: task-040 Deleted intersections0/0 completed
    - group [ref=f1e180]:
      - button "Open project" [ref=f1e181]
    - group [ref=f1e183]:
      - button "Archive project" [ref=f1e184]
  - generic [ref=f1e185]:
    - text: task-040 Bulk position first1/3 completed
    - group [ref=f1e187]:
      - button "Open project" [ref=f1e188]
    - group [ref=f1e190]:
      - button "Archive project" [ref=f1e191]
  - generic [ref=f1e192]:
    - text: task-040 Bulk position second0/2 completed
    - group [ref=f1e194]:
      - button "Open project" [ref=f1e195]
    - group [ref=f1e197]:
      - button "Archive project" [ref=f1e198]
  - generic [ref=f1e199]:
    - text: task-040 Bulk deletion restart first0/3 completed
    - group [ref=f1e201]:
      - button "Open project" [ref=f1e202]
    - group [ref=f1e204]:
      - button "Archive project" [ref=f1e205]
  - generic [ref=f1e206]:
    - text: task-040 Bulk deletion restart holding0/2 completed
    - group [ref=f1e208]:
      - button "Open project" [ref=f1e209]
    - group [ref=f1e211]:
      - button "Archive project" [ref=f1e212]
  - generic [ref=f1e213]:
    - text: task-040 Bulk deletion restart second0/0 completed
    - group [ref=f1e215]:
      - button "Open project" [ref=f1e216]
    - group [ref=f1e218]:
      - button "Archive project" [ref=f1e219]
  - generic [ref=f1e220]:
    - text: task-040 Bulk delete first owner1/6 completed
    - group [ref=f1e222]:
      - button "Open project" [ref=f1e223]
    - group [ref=f1e225]:
      - button "Archive project" [ref=f1e226]
  - generic [ref=f1e227]:
    - text: task-040 Bulk delete second owner0/3 completed
    - group [ref=f1e229]:
      - button "Open project" [ref=f1e230]
    - group [ref=f1e232]:
      - button "Archive project" [ref=f1e233]
  - generic [ref=f1e234]:
    - text: task-040 Bulk duplicate owner0/3 completed
    - group [ref=f1e236]:
      - button "Open project" [ref=f1e237]
    - group [ref=f1e239]:
      - button "Archive project" [ref=f1e240]
  - generic [ref=f1e241]:
    - text: task-040 Bulk duplicate owner1/3 completed
    - group [ref=f1e243]:
      - button "Open project" [ref=f1e244]
    - group [ref=f1e246]:
      - button "Archive project" [ref=f1e247]
  - generic [ref=f1e248]:
    - text: task-040 Date batch first1/5 completed
    - group [ref=f1e250]:
      - button "Open project" [ref=f1e251]
    - group [ref=f1e253]:
      - button "Archive project" [ref=f1e254]
  - generic [ref=f1e255]:
    - text: task-040 Date batch second0/1 completed
    - group [ref=f1e257]:
      - button "Open project" [ref=f1e258]
    - group [ref=f1e260]:
      - button "Archive project" [ref=f1e261]
  - generic [ref=f1e262]:
    - text: task-040 Date validation first0/1 completed
    - group [ref=f1e264]:
      - button "Open project" [ref=f1e265]
    - group [ref=f1e267]:
      - button "Archive project" [ref=f1e268]
  - generic [ref=f1e269]:
    - text: task-040 Date validation second1/1 completed
    - group [ref=f1e271]:
      - button "Open project" [ref=f1e272]
    - group [ref=f1e274]:
      - button "Archive project" [ref=f1e275]
  - generic [ref=f1e276]:
    - text: task-040 Due reserved first1/3 completed
    - group [ref=f1e278]:
      - button "Open project" [ref=f1e279]
    - group [ref=f1e281]:
      - button "Archive project" [ref=f1e282]
  - generic [ref=f1e283]:
    - text: task-040 Due reserved second0/2 completed
    - group [ref=f1e285]:
      - button "Open project" [ref=f1e286]
    - group [ref=f1e288]:
      - button "Archive project" [ref=f1e289]
  - generic [ref=f1e290]:
    - text: task-040 Due presence first1/3 completed
    - group [ref=f1e292]:
      - button "Open project" [ref=f1e293]
    - group [ref=f1e295]:
      - button "Archive project" [ref=f1e296]
  - generic [ref=f1e297]:
    - text: task-040 Due presence second0/1 completed
    - group [ref=f1e299]:
      - button "Open project" [ref=f1e300]
    - group [ref=f1e302]:
      - button "Archive project" [ref=f1e303]
  - generic [ref=f1e304]:
    - text: task-040 Due bulk Z first0/2 completed
    - group [ref=f1e306]:
      - button "Open project" [ref=f1e307]
    - group [ref=f1e309]:
      - button "Archive project" [ref=f1e310]
  - generic [ref=f1e311]:
    - text: task-040 Due bulk A second0/1 completed
    - group [ref=f1e313]:
      - button "Open project" [ref=f1e314]
    - group [ref=f1e316]:
      - button "Archive project" [ref=f1e317]
  - generic [ref=f1e318]:
    - text: task-040 Due duplicate owner1/2 completed
    - group [ref=f1e320]:
      - button "Open project" [ref=f1e321]
    - group [ref=f1e323]:
      - button "Archive project" [ref=f1e324]
  - generic [ref=f1e325]:
    - text: task-040 Due duplicate owner1/2 completed
    - group [ref=f1e327]:
      - button "Open project" [ref=f1e328]
    - group [ref=f1e330]:
      - button "Archive project" [ref=f1e331]
  - generic [ref=f1e332]:
    - text: task-040 Due restart first1/3 completed
    - group [ref=f1e334]:
      - button "Open project" [ref=f1e335]
    - group [ref=f1e337]:
      - button "Archive project" [ref=f1e338]
  - generic [ref=f1e339]:
    - text: task-040 Due restart second0/2 completed
    - group [ref=f1e341]:
      - button "Open project" [ref=f1e342]
    - group [ref=f1e344]:
      - button "Archive project" [ref=f1e345]
  - generic [ref=f1e346]:
    - text: task-040 Due independent bulk1/2 completed
    - group [ref=f1e348]:
      - button "Open project" [ref=f1e349]
    - group [ref=f1e351]:
      - button "Archive project" [ref=f1e352]
  - generic [ref=f1e353]:
    - text: task-040 Notes batch first1/5 completed
    - group [ref=f1e355]:
      - button "Open project" [ref=f1e356]
    - group [ref=f1e358]:
      - button "Archive project" [ref=f1e359]
  - generic [ref=f1e360]:
    - text: task-040 Notes batch second0/1 completed
    - group [ref=f1e362]:
      - button "Open project" [ref=f1e363]
    - group [ref=f1e365]:
      - button "Archive project" [ref=f1e366]
  - generic [ref=f1e367]:
    - text: task-040 Notes limit first0/1 completed
    - group [ref=f1e369]:
      - button "Open project" [ref=f1e370]
    - group [ref=f1e372]:
      - button "Archive project" [ref=f1e373]
  - generic [ref=f1e374]:
    - text: task-040 Notes limit second1/1 completed
    - group [ref=f1e376]:
      - button "Open project" [ref=f1e377]
    - group [ref=f1e379]:
      - button "Archive project" [ref=f1e380]
  - generic [ref=f1e381]:
    - text: task-040 Notes reserved first1/3 completed
    - group [ref=f1e383]:
      - button "Open project" [ref=f1e384]
    - group [ref=f1e386]:
      - button "Archive project" [ref=f1e387]
  - generic [ref=f1e388]:
    - text: task-040 Notes reserved second0/2 completed
    - group [ref=f1e390]:
      - button "Open project" [ref=f1e391]
    - group [ref=f1e393]:
      - button "Archive project" [ref=f1e394]
  - generic [ref=f1e395]:
    - text: task-040 Notes presence first1/3 completed
    - group [ref=f1e397]:
      - button "Open project" [ref=f1e398]
    - group [ref=f1e400]:
      - button "Archive project" [ref=f1e401]
  - generic [ref=f1e402]:
    - text: task-040 Notes presence second0/1 completed
    - group [ref=f1e404]:
      - button "Open project" [ref=f1e405]
    - group [ref=f1e407]:
      - button "Archive project" [ref=f1e408]
  - generic [ref=f1e409]:
    - text: task-040 Notes independent bulk1/2 completed
    - group [ref=f1e411]:
      - button "Open project" [ref=f1e412]
    - group [ref=f1e414]:
      - button "Archive project" [ref=f1e415]
  - generic [ref=f1e416]:
    - text: task-040 Notes duplicate owner1/2 completed
    - group [ref=f1e418]:
      - button "Open project" [ref=f1e419]
    - group [ref=f1e421]:
      - button "Archive project" [ref=f1e422]
  - generic [ref=f1e423]:
    - text: task-040 Notes duplicate owner1/2 completed
    - group [ref=f1e425]:
      - button "Open project" [ref=f1e426]
    - group [ref=f1e428]:
      - button "Archive project" [ref=f1e429]
  - generic [ref=f1e430]:
    - text: task-040 Notes restart first1/3 completed
    - group [ref=f1e432]:
      - button "Open project" [ref=f1e433]
    - group [ref=f1e435]:
      - button "Archive project" [ref=f1e436]
  - generic [ref=f1e437]:
    - text: task-040 Notes restart second0/2 completed
    - group [ref=f1e439]:
      - button "Open project" [ref=f1e440]
    - group [ref=f1e442]:
      - button "Archive project" [ref=f1e443]
  - generic [ref=f1e444]:
    - text: task-040 Ordering Zulu owner0/3 completed
    - group [ref=f1e446]:
      - button "Open project" [ref=f1e447]
    - group [ref=f1e449]:
      - button "Archive project" [ref=f1e450]
  - generic [ref=f1e451]:
    - text: task-040 Ordering Alpha owner0/2 completed
    - group [ref=f1e453]:
      - button "Open project" [ref=f1e454]
    - group [ref=f1e456]:
      - button "Archive project" [ref=f1e457]
  - generic [ref=f1e458]:
    - text: task-040 Ordering actions owner3/5 completed
    - group [ref=f1e460]:
      - button "Open project" [ref=f1e461]
    - group [ref=f1e463]:
      - button "Archive project" [ref=f1e464]
  - generic [ref=f1e465]:
    - text: task-040 Ordering active guard owner0/1 completed
    - group [ref=f1e467]:
      - button "Open project" [ref=f1e468]
    - group [ref=f1e470]:
      - button "Archive project" [ref=f1e471]
  - generic [ref=f1e472]:
    - text: task-040 Ordering Unicode owner0/4 completed
    - group [ref=f1e474]:
      - button "Open project" [ref=f1e475]
    - group [ref=f1e477]:
      - button "Archive project" [ref=f1e478]
  - generic [ref=f1e479]:
    - text: task-040 Archive first owner1/1 completed
    - group [ref=f1e481]:
      - button "Open project" [ref=f1e482]
    - group [ref=f1e484]:
      - button "Archive project" [ref=f1e485]
  - generic [ref=f1e486]:
    - text: task-040 Archive second owner1/2 completed
    - group [ref=f1e488]:
      - button "Open project" [ref=f1e489]
    - group [ref=f1e491]:
      - button "Archive project" [ref=f1e492]
  - generic [ref=f1e493]:
    - text: task-040 Archive excluded owner0/1 completed
    - group [ref=f1e495]:
      - button "Open project" [ref=f1e496]
    - group [ref=f1e498]:
      - button "Archive project" [ref=f1e499]
  - generic [ref=f1e500]:
    - text: task-040 Archive empty owner0/0 completed
    - group [ref=f1e502]:
      - button "Open project" [ref=f1e503]
    - group [ref=f1e505]:
      - button "Archive project" [ref=f1e506]
  - generic [ref=f1e507]:
    - text: task-040 Archive duplicate0/0 completed
    - group [ref=f1e509]:
      - button "Open project" [ref=f1e510]
    - group [ref=f1e512]:
      - button "Archive project" [ref=f1e513]
  - generic [ref=f1e514]:
    - text: task-040 Archive duplicate0/1 completed
    - group [ref=f1e516]:
      - button "Open project" [ref=f1e517]
    - group [ref=f1e519]:
      - button "Archive project" [ref=f1e520]
  - generic [ref=f1e521]:
    - text: task-040 Archive matching1/1 completed
    - group [ref=f1e523]:
      - button "Open project" [ref=f1e524]
    - group [ref=f1e526]:
      - button "Archive project" [ref=f1e527]
  - generic [ref=f1e528]:
    - text: task-040 Archive wrong prefix1/1 completed
    - group [ref=f1e530]:
      - button "Open project" [ref=f1e531]
    - group [ref=f1e533]:
      - button "Archive project" [ref=f1e534]
  - generic [ref=f1e535]:
    - text: task-040 Archive wrong default1/1 completed
    - group [ref=f1e537]:
      - button "Open project" [ref=f1e538]
    - group [ref=f1e540]:
      - button "Archive project" [ref=f1e541]
  - generic [ref=f1e542]:
    - text: task-040 Archive wrong priority1/1 completed
    - group [ref=f1e544]:
      - button "Open project" [ref=f1e545]
    - group [ref=f1e547]:
      - button "Archive project" [ref=f1e548]
  - generic [ref=f1e549]:
    - text: task-040 Archive wrong date1/1 completed
    - group [ref=f1e551]:
      - button "Open project" [ref=f1e552]
    - group [ref=f1e554]:
      - button "Archive project" [ref=f1e555]
  - generic [ref=f1e556]:
    - text: task-040 Archive wrong notes1/1 completed
    - group [ref=f1e558]:
      - button "Open project" [ref=f1e559]
    - group [ref=f1e561]:
      - button "Archive project" [ref=f1e562]
  - generic [ref=f1e563]:
    - text: task-040 Archive wrong completion0/1 completed
    - group [ref=f1e565]:
      - button "Open project" [ref=f1e566]
    - group [ref=f1e568]:
      - button "Archive project" [ref=f1e569]
  - generic [ref=f1e570]:
    - text: task-040 Archive restart first1/3 completed
    - group [ref=f1e572]:
      - button "Open project" [ref=f1e573]
    - group [ref=f1e575]:
      - button "Archive project" [ref=f1e576]
  - generic [ref=f1e577]:
    - text: task-040 Archive restart second0/2 completed
    - group [ref=f1e579]:
      - button "Open project" [ref=f1e580]
    - group [ref=f1e582]:
      - button "Archive project" [ref=f1e583]
  - generic [ref=f1e584]:
    - text: task-040 Default edit first1/2 completed
    - group [ref=f1e586]:
      - button "Open project" [ref=f1e587]
    - group [ref=f1e589]:
      - button "Archive project" [ref=f1e590]
  - generic [ref=f1e591]:
    - text: task-040 Default edit second0/2 completed
    - group [ref=f1e593]:
      - button "Open project" [ref=f1e594]
    - group [ref=f1e596]:
      - button "Archive project" [ref=f1e597]
  - generic [ref=f1e598]:
    - text: task-040 Default edit excluded0/1 completed
    - group [ref=f1e600]:
      - button "Open project" [ref=f1e601]
    - group [ref=f1e603]:
      - button "Archive project" [ref=f1e604]
  - generic [ref=f1e605]:
    - text: task-040 Default edit duplicate0/1 completed
    - group [ref=f1e607]:
      - button "Open project" [ref=f1e608]
    - group [ref=f1e610]:
      - button "Archive project" [ref=f1e611]
  - generic [ref=f1e612]:
    - text: task-040 Default edit duplicate0/0 completed
    - group [ref=f1e614]:
      - button "Open project" [ref=f1e615]
    - group [ref=f1e617]:
      - button "Archive project" [ref=f1e618]
  - generic [ref=f1e619]:
    - text: task-040 Default edit duplicate0/1 completed
    - group [ref=f1e621]:
      - button "Open project" [ref=f1e622]
    - group [ref=f1e624]:
      - button "Archive project" [ref=f1e625]
  - generic [ref=f1e626]:
    - text: task-040 Default matching1/1 completed
    - group [ref=f1e628]:
      - button "Open project" [ref=f1e629]
    - group [ref=f1e631]:
      - button "Archive project" [ref=f1e632]
  - generic [ref=f1e633]:
    - text: task-040 Default wrong prefix1/1 completed
    - group [ref=f1e635]:
      - button "Open project" [ref=f1e636]
    - group [ref=f1e638]:
      - button "Archive project" [ref=f1e639]
  - generic [ref=f1e640]:
    - text: task-040 Default wrong default1/1 completed
    - group [ref=f1e642]:
      - button "Open project" [ref=f1e643]
    - group [ref=f1e645]:
      - button "Archive project" [ref=f1e646]
  - generic [ref=f1e647]:
    - text: task-040 Default wrong priority1/1 completed
    - group [ref=f1e649]:
      - button "Open project" [ref=f1e650]
    - group [ref=f1e652]:
      - button "Archive project" [ref=f1e653]
  - generic [ref=f1e654]:
    - text: task-040 Default wrong date1/1 completed
    - group [ref=f1e656]:
      - button "Open project" [ref=f1e657]
    - group [ref=f1e659]:
      - button "Archive project" [ref=f1e660]
  - generic [ref=f1e661]:
    - text: task-040 Default wrong notes1/1 completed
    - group [ref=f1e663]:
      - button "Open project" [ref=f1e664]
    - group [ref=f1e666]:
      - button "Archive project" [ref=f1e667]
  - generic [ref=f1e668]:
    - text: task-040 Default wrong completion0/1 completed
    - group [ref=f1e670]:
      - button "Open project" [ref=f1e671]
    - group [ref=f1e673]:
      - button "Archive project" [ref=f1e674]
  - generic [ref=f1e675]:
    - text: task-040 Default restart first1/3 completed
    - group [ref=f1e677]:
      - button "Open project" [ref=f1e678]
    - group [ref=f1e680]:
      - button "Archive project" [ref=f1e681]
  - generic [ref=f1e682]:
    - text: task-040 Default restart second0/2 completed
    - group [ref=f1e684]:
      - button "Open project" [ref=f1e685]
    - group [ref=f1e687]:
      - button "Archive project" [ref=f1e688]
  - generic [ref=f1e689]:
    - text: task-040 Owner totals zulu first1/2 completed
    - group [ref=f1e691]:
      - button "Open project" [ref=f1e692]
    - group [ref=f1e694]:
      - button "Archive project" [ref=f1e695]
  - generic [ref=f1e696]:
    - text: task-040 Owner totals alpha second1/1 completed
    - group [ref=f1e698]:
      - button "Open project" [ref=f1e699]
    - group [ref=f1e701]:
      - button "Archive project" [ref=f1e702]
  - generic [ref=f1e703]:
    - text: task-040 Duplicate owner first0/1 completed
    - group [ref=f1e705]:
      - button "Open project" [ref=f1e706]
    - group [ref=f1e708]:
      - button "Archive project" [ref=f1e709]
  - generic [ref=f1e710]:
    - text: task-040 Duplicate owner first1/1 completed
    - group [ref=f1e712]:
      - button "Open project" [ref=f1e713]
    - group [ref=f1e715]:
      - button "Archive project" [ref=f1e716]
  - generic [ref=f1e717]:
    - text: task-040 Duplicate owner first0/1 completed
    - group [ref=f1e719]:
      - button "Open project" [ref=f1e720]
    - group [ref=f1e722]:
      - button "Archive project" [ref=f1e723]
  - generic [ref=f1e724]:
    - text: task-040 Prefix modes owner0/7 completed
    - group [ref=f1e726]:
      - button "Open project" [ref=f1e727]
    - group [ref=f1e729]:
      - button "Archive project" [ref=f1e730]
  - generic [ref=f1e731]:
    - text: task-040 Prefix literals owner0/7 completed
    - group [ref=f1e733]:
      - button "Open project" [ref=f1e734]
    - group [ref=f1e736]:
      - button "Archive project" [ref=f1e737]
  - generic [ref=f1e738]:
    - text: task-040 Owner bulk high0/2 completed
    - group [ref=f1e740]:
      - button "Open project" [ref=f1e741]
    - group [ref=f1e743]:
      - button "Archive project" [ref=f1e744]
  - generic [ref=f1e745]:
    - text: task-040 Owner bulk low1/1 completed
    - group [ref=f1e747]:
      - button "Open project" [ref=f1e748]
    - group [ref=f1e750]:
      - button "Archive project" [ref=f1e751]
  - generic [ref=f1e752]:
    - text: task-040 Prefix restart first1/3 completed
    - group [ref=f1e754]:
      - button "Open project" [ref=f1e755]
    - group [ref=f1e757]:
      - button "Archive project" [ref=f1e758]
  - generic [ref=f1e759]:
    - text: task-040 Prefix restart second0/2 completed
    - group [ref=f1e761]:
      - button "Open project" [ref=f1e762]
    - group [ref=f1e764]:
      - button "Archive project" [ref=f1e765]
  - generic [ref=f1e766]:
    - text: task-040 Priority reserved first1/3 completed
    - group [ref=f1e768]:
      - button "Open project" [ref=f1e769]
    - group [ref=f1e771]:
      - button "Archive project" [ref=f1e772]
  - generic [ref=f1e773]:
    - text: task-040 Priority reserved second0/2 completed
    - group [ref=f1e775]:
      - button "Open project" [ref=f1e776]
    - group [ref=f1e778]:
      - button "Archive project" [ref=f1e779]
  - generic [ref=f1e780]:
    - text: task-040 Priority batch first owner1/5 completed
    - group [ref=f1e782]:
      - button "Open project" [ref=f1e783]
    - group [ref=f1e785]:
      - button "Archive project" [ref=f1e786]
  - generic [ref=f1e787]:
    - text: task-040 Priority batch second owner0/1 completed
    - group [ref=f1e789]:
      - button "Open project" [ref=f1e790]
    - group [ref=f1e792]:
      - button "Archive project" [ref=f1e793]
  - generic [ref=f1e794]:
    - text: task-040 Priority duplicate owner0/3 completed
    - group [ref=f1e796]:
      - button "Open project" [ref=f1e797]
    - group [ref=f1e799]:
      - button "Archive project" [ref=f1e800]
  - generic [ref=f1e801]:
    - text: task-040 Priority duplicate owner1/3 completed
    - group [ref=f1e803]:
      - button "Open project" [ref=f1e804]
    - group [ref=f1e806]:
      - button "Archive project" [ref=f1e807]
  - generic [ref=f1e808]:
    - text: task-040 Owner low first1/2 completed
    - group [ref=f1e810]:
      - button "Open project" [ref=f1e811]
    - group [ref=f1e813]:
      - button "Archive project" [ref=f1e814]
  - generic [ref=f1e815]:
    - text: task-040 Owner high second0/1 completed
    - group [ref=f1e817]:
      - button "Open project" [ref=f1e818]
    - group [ref=f1e820]:
      - button "Archive project" [ref=f1e821]
  - generic [ref=f1e822]:
    - text: task-040 Owner normal third0/1 completed
    - group [ref=f1e824]:
      - button "Open project" [ref=f1e825]
    - group [ref=f1e827]:
      - button "Archive project" [ref=f1e828]
  - generic [ref=f1e829]:
    - text: task-040 Owner bulk high0/0 completed
    - group [ref=f1e831]:
      - button "Open project" [ref=f1e832]
    - group [ref=f1e834]:
      - button "Archive project" [ref=f1e835]
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
> 16 |   await expect(projectRow(page, name.trim())).toBeVisible();
     |                                               ^ Error: expect(locator).toBeVisible() failed
  17 | }
  18 | export async function openProject(page, name) {
  19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
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