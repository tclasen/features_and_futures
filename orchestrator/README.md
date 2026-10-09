# PM orchestration

The current runner implements the authorized Workboard engineering pilot in runs/instruction-effects/pilot-001. Preparation freezes the full matrix, exact inputs, image and pricing before any task dispatch. The runner resumes from append-only evidence and the run's state index, preserves failed attempts, and stops after three synchronized rounds.

See [the runtime procedure](../docs/pilot-runtime.md) for commands, isolation, measurement boundaries and limitations. Adapters, gateway, evidence and validation are shared components. prepare.py, pilot.py and report.py currently target this explicit pilot; extending them to another project/run must resolve new manifest paths and freeze a new definition rather than overwrite pilot inputs.

Builder source and live deployment directories are independent siblings outside this repository. Only PM-owned acceptance code runs on the host. The browser addresses a loopback port of an isolated application sandbox.
