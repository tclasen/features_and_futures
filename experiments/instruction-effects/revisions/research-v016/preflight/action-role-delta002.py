"""Exact prospective role-only transformation; no public assertion or packet changes."""
import re
ACTION_NAMES=('Download project','Export matching workspace','Task directory','Search directory','Complete visible tasks','Reopen visible tasks','Archive visible projects','Restore visible projects','Set visible project default')
def transform(text, filename):
 result=text
 for name in ACTION_NAMES:
  pattern=re.compile(r"(?P<receiver>[A-Za-z_$][\w$]*)\.getByRole\((?P<quote>['\"])button(?P=quote),\s*\{\s*name:\s*(?P<labelq>['\"])"+re.escape(name)+r"(?P=labelq)\s*,\s*exact:\s*true\s*\}\)")
  def replace(m):return m.group(0)+'.or('+m.group('receiver')+".getByRole('link',{name:"+repr(name)+',exact:true}))'
  result=pattern.sub(replace,result)
 if filename in {'directory.spec.mjs','directory-order.spec.mjs','directory-project-order.spec.mjs'}:
  assert 'directory-task-row' in text
  for receiver in ["row(page,archived)","row(page,title('Filter archived'))","row(page,title('Gap  task'))","rows(page).first()","rows(page).last()"]:
   old=receiver+".getByRole('button',{name:'Open project',exact:true})"
   result=result.replace(old,old+'.or('+receiver+".getByRole('link',{name:'Open project',exact:true}))")
 if filename == 'directory-presence-helpers.mjs':
  old="p.getByRole('button',{name:label,exact:true})"
  replacement="(['Complete visible tasks','Reopen visible tasks'].includes(label)?"+old+".or(p.getByRole('link',{name:label,exact:true})):"+old+")"
  result=result.replace(old,replacement)
 return result
