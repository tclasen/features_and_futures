"""One-off trusted PM drain request; no builder source or inference changes."""
import sys,os,signal,json
from pathlib import Path
from datetime import datetime,timezone
assert os.getpid()==12544
assert sys.argv[-2:]==['--run','eval-002']
selected=[]
for frame in sys._current_frames().values():
 while frame:
  if frame.f_code.co_filename.endswith('/orchestrator/pilot.py') and frame.f_code.co_name=='main' and 'stop_event' in frame.f_locals:
   selected.append(frame.f_locals)
  frame=frame.f_back
assert len(selected)==1
selected[0]['stop_event'].set()
receipt={'utc':datetime.now(timezone.utc).isoformat(),'runner_pid':os.getpid(),'stop_event_set':selected[0]['stop_event'].is_set(),'sigint_disposition':'ignored' if signal.getsignal(signal.SIGINT)==signal.SIG_IGN else 'handled-or-default','reason':'confirmed task011 frozen observer false rejection','scope':'stop future attempts; existing native calls and archives drain'}
selected[0]['ledger'].event('pm_cooperative_drain_requested',reason=receipt['reason'],process_id=os.getpid())
Path('/Users/Shared/projects/competition/.local/eval002-cooperative-stop-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
