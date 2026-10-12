"""Exact prospective role-only transformation; no public assertion or packet changes."""
import re
ACTION_NAMES=('Download project','Export matching workspace','Task directory','Search directory','Complete visible tasks','Reopen visible tasks','Archive visible projects','Restore visible projects','Set visible project default')
def with_action_role_choices(text, filename):
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


def verify_role_only_delta(original, prospective):
    return _verify(original, prospective, False)


def verify_restore_summary_action_delta(original, prospective):
    return _verify(original, prospective, True)


def _verify(original, prospective, inherited):
    from .restore_readiness import with_restore_readiness
    from .summary_readiness import with_summary_text
    before_files = {p.relative_to(original) for p in original.rglob('*') if p.is_file()}
    after_files = {p.relative_to(prospective) for p in prospective.rglob('*') if p.is_file()}
    if before_files != after_files:
        raise ValueError('Prospective action-role observer changes suite file inventory')
    changed = []
    for name in sorted(before_files):
        before, after = (original/name).read_bytes(), (prospective/name).read_bytes()
        expected = before
        if str(name).endswith('.mjs'):
            source = before.decode()
            if inherited and str(name).endswith('.spec.mjs'):
                source = with_restore_readiness(source)
                if str(name) == 'return-order.spec.mjs':
                    source = with_summary_text(source)
            expected = with_action_role_choices(source, str(name)).encode()
        if after != expected:
            raise ValueError(f'Unexpected prospective action-role observer delta: {name}')
        if before != after:
            changed.append(str(name))
    return changed
