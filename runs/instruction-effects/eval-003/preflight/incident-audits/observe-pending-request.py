# PM-only read-only process diagnosis; no model calls or gateway mutations.
import sys,json,datetime
from pathlib import Path
if sys.argv[-2:] != ['--run','eval-003'] or not sys.argv[0].endswith('/orchestrator/evaluation.py'):
    raise RuntimeError('Wrong PM process; refuse diagnostic execution')
rows=[]
for frame in sys._current_frames().values():
    while frame is not None:
        if frame.f_code.co_name=='relay' and frame.f_code.co_filename.endswith('/orchestrator/gateway.py'):
            values=frame.f_locals;lease=values.get('lease',{})
            rows.append({'builder_id':lease.get('builder_id'),'task_id':lease.get('task_id'),'attempt_id':lease.get('attempt_id'),'model':lease.get('model'),'request_id':values.get('request_id'),'upstream_status':values.get('status'),'observed_raw_bytes':len(values.get('raw',b'')),'terminal_usage_observed':values.get('usage') is not None})
        frame=frame.f_back
out=Path('/Users/Shared/projects/competition/runs/instruction-effects/eval-003/preflight/incident-audits/pending-request-observation.json')
out.write_text(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'purpose':'Read-only diagnosis; no accounting inference or runtime change','requests':rows},indent=2)+'\n')
