# PM orchestration

The current runner implements the authorized Workboard engineering pilot in runs/instruction-effects/pilot-001. Preparation freezes the full matrix, exact inputs, image and pricing before any task dispatch. The runner resumes from append-only evidence and the run's state index, preserves failed attempts, and stops after three synchronized rounds.

See [the runtime procedure](../docs/pilot-runtime.md) for commands, isolation, measurement boundaries and limitations. Adapters, gateway, evidence and validation are shared components. prepare.py, pilot.py and report.py currently target this explicit pilot; extending them to another project/run must resolve new manifest paths and freeze a new definition rather than overwrite pilot inputs.

Builder source and live deployment directories are independent siblings outside this repository. Only PM-owned acceptance code runs on the host. The browser addresses a loopback port of an isolated application sandbox.

`python3 -m orchestrator.recheck_acceptance --run pilot-005 --suite-revision v005` validates currently accepted immutable submissions against the separately prepared stronger suite, including original prior-stage database snapshots and real restart checks. It creates separate diagnostic evidence and isolated app sandboxes; it neither dispatches builders nor changes original results. A successful partial corpus is not a full 54-checkpoint validation. Optional `--builder` and `--stage` filters support preparation smoke checks.

The browser-feedback renderer under `proposals/` is tested but inactive. Adoption must be explicit in a future frozen execution revision.
