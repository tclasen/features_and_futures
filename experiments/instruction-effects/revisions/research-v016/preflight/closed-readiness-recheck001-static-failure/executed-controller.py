"""Recheck closed adoption inputs while full browser gates remain pending.

Execute the exact read-only validation sections of the saved freeze controller.
Never execute its full-browser loop, plan mutation, or adoption-output section.
"""
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

base = Path('experiments/instruction-effects/revisions/research-v016/preflight')
controller = base / 'freeze-plan001.py'
source = controller.read_text()
prefix_end = source.index('for stage, variants, cases, probes in ')
native_start = source.index('native = checked(')
mutation_start = source.index("output = base / 'adoption'")
assert prefix_end < native_start < mutation_start
sections = source[:prefix_end] + '\n' + source[native_start:mutation_start]
assert "plan['status'] =" not in sections
assert 'write_json(' not in sections
assert 'output.mkdir' not in sections
plan = base.parent / 'analysis-plan.json'
original = plan.read_bytes()
output = base / 'closed-readiness-recheck001'
assert not output.exists()
output.mkdir()
shutil.copy2(__file__, output / 'executed-controller.py')
(output / 'executed-readonly-sections.py').write_text(sections)
(output / 'freeze-controller-input.py').write_bytes(controller.read_bytes())
namespace = {'__file__': str(output / 'executed-readonly-sections.py')}
try:
    exec(compile(sections, str(output / 'executed-readonly-sections.py'), 'exec'), namespace)
    assert plan.read_bytes() == original
    proofs = namespace['evidence']
    pending = [str(base / ('full%03d-action-role-independent001' % stage) / 'verified.json')
               for stage in [30, 40]
               if not (base / ('full%03d-action-role-independent001' % stage) / 'verified.json').is_file()]
    assert pending, 'This partial verifier cannot replace the final full-gate freeze operation'
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    result = {'verified_closed_subset': True, 'all_gates_ready': False,
              'utc': datetime.now(timezone.utc).isoformat(), 'native_model_calls': 0,
              'plan_unchanged': True, 'plan_status': json.loads(original)['status'],
              'plan_sha256': hashlib.sha256(original).hexdigest(),
              'freeze_controller_sha256': sha(controller),
              'readonly_sections_sha256': sha(output / 'executed-readonly-sections.py'),
              'executed_controller_sha256': sha(Path(__file__)),
              'verified_closed_proofs': proofs, 'pending_full_browser_proofs': pending,
              'scope': 'Read-only revalidation of closed PM/source/phase/focused/native-diagnostic/runtime/publication gates only. Full synthetic browser gates pending; no plan freeze, fresh run preparation or model dispatch.'}
    (output / 'verified-subset.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'verified_closed_subset': True, 'closed_proofs': len(proofs),
                      'pending_full_browser_proofs': len(pending), 'plan_unchanged': True}))
except BaseException as error:
    (output / 'failure.json').write_text(json.dumps({'retained': True,
        'type': type(error).__name__, 'message': str(error),
        'plan_unchanged': plan.read_bytes() == original, 'native_model_calls': 0}, indent=2) + '\n')
    raise
