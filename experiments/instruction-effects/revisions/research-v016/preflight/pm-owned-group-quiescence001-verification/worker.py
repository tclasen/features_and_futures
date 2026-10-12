import signal,sys,time
from pathlib import Path
folder=Path(sys.argv[1])
def finish(signum,frame):
 time.sleep(1)
 (folder/'transient.bin').unlink()
 (folder/'cleanup-finished').write_text('done')
 raise SystemExit(0)
signal.signal(signal.SIGTERM,finish)
(folder/'transient.bin').write_bytes(b'PM-only incomplete artifact bytes')
(folder/'worker-ready').write_text('ready')
while True:time.sleep(.05)
