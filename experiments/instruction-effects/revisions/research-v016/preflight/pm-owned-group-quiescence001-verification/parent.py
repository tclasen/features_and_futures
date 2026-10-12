import subprocess,sys,time
from pathlib import Path
folder=Path(sys.argv[1]);subprocess.Popen([sys.executable,str(folder.parent/'worker.py'),str(folder)])
while not (folder/'worker-ready').exists():time.sleep(.01)
(folder/'parent-ready').write_text('ready')
while True:time.sleep(.05)
