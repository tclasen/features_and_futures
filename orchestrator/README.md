# PM orchestration

The current runner implements the authorized Workboard engineering pilot in runs/instruction-effects/pilot-001. Preparation freezes the full matrix, exact inputs, image and pricing before any task dispatch. The runner resumes from append-only evidence and the run's state index, preserves failed attempts, and stops after three synchronized rounds.

See [the runtime procedure](../docs/pilot-runtime.md) for commands, isolation, measurement boundaries and limitations. Adapters, gateway, evidence and validation are shared components. prepare.py, pilot.py and report.py currently target this explicit pilot; extending them to another project/run must resolve new manifest paths and freeze a new definition rather than overwrite pilot inputs.

Builder source and live deployment directories are independent siblings outside this repository. Only PM-owned acceptance code runs on the host. The browser addresses a loopback port of an isolated application sandbox.

`python3 -m orchestrator.recheck_acceptance --run pilot-005 --suite-revision v005` validates currently accepted immutable submissions against the separately prepared stronger suite, including original prior-stage database snapshots and real restart checks. It creates separate diagnostic evidence and isolated app sandboxes; it neither dispatches builders nor changes original results. A successful partial corpus is not a full 54-checkpoint validation. Optional `--builder` and `--stage` filters support preparation smoke checks.

The browser-feedback renderer under `proposals/` is tested but inactive. Adoption must be explicit in a future frozen execution revision.

`python3 -m orchestrator.audit_native_receipts --run pilot-005` independently decodes archived SSE/JSON receipts and local native completion observations, checks ledger counters/raw hashes, and recomputes decimal reference arithmetic. Its immutable report names the usage snapshot and raw hashes. A live snapshot excludes requests not yet recorded and cannot establish complete-run readiness.

`python3 -m orchestrator.watch_pilot --run pilot-005 --idle-seconds 300 --interval-seconds 15` writes a separate observation journal for prolonged inference/commit inactivity and missing runner handles. It neither terminates processes nor changes budgets, feedback or outcomes. Investigate alerts against native evidence before attributing a failure.

`python3 -m orchestrator.audit_request_coverage --run pilot-005` reconciles every dispatched request with usage/terminal events, attribution and monotonic timing. It independently checks frozen definition/packet hashes. A completed run requires exact coverage; a live run explicitly retains pending request IDs. Run this together with the native-receipt audit and the original pilot readiness report after completion.
