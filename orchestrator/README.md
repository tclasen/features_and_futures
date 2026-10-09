# PM orchestration

The current runner implements the authorized Workboard engineering pilot using the explicit run selected by `--run`. Preparation freezes the full matrix, exact inputs, image and pricing before any task dispatch. The runner resumes from append-only evidence and the run's state index, preserves failed attempts, and supports an append-only frozen task stream after each full-cohort barrier.

See [the runtime procedure](../docs/pilot-runtime.md) for commands, isolation, measurement boundaries and limitations. Adapters, gateway, evidence and validation are shared components. prepare.py, pilot.py and report.py currently target this explicit pilot; extending them to another project/run must resolve new manifest paths and freeze a new definition rather than overwrite pilot inputs.

Builder source and live deployment directories are independent siblings outside this repository. Only PM-owned acceptance code runs on the host. The browser addresses a loopback port of an isolated application sandbox.

`python3 -m orchestrator.recheck_acceptance --run pilot-005 --suite-revision v005` validates currently accepted immutable submissions against the separately prepared stronger suite, including original prior-stage database snapshots and real restart checks. It creates separate diagnostic evidence and isolated app sandboxes; it neither dispatches builders nor changes original results. A successful partial corpus is not a full manifest-defined checkpoint validation. Optional `--builder` and `--stage` filters support preparation smoke checks.

The visible-state renderer is uniformly active in manifests selecting native-and-visible-state-v3. Original revisions retain their original behavior.

`python3 -m orchestrator.audit_native_receipts --run pilot-005` independently decodes archived SSE/JSON receipts and local native completion observations, checks ledger counters/raw hashes, and recomputes decimal reference arithmetic. Its immutable report names the usage snapshot and raw hashes. A live snapshot excludes requests not yet recorded and cannot establish complete-run readiness.

`python3 -m orchestrator.watch_pilot --run pilot-005 --idle-seconds 300 --interval-seconds 15` writes a separate observation journal for prolonged inference/commit inactivity and missing runner handles. It neither terminates processes nor changes budgets, feedback or outcomes. Investigate alerts against native evidence before attributing a failure.

`python3 -m orchestrator.audit_request_coverage --run pilot-005` reconciles every dispatched request with usage/terminal events, attribution and monotonic timing. It independently checks frozen definition/packet hashes. A completed run requires exact coverage; a live run explicitly retains pending request IDs. Run this together with the native-receipt audit and the original pilot readiness report after completion.

`python3 -B -m orchestrator.audit_scheduling --run pilot-008` independently verifies per-builder attempt exclusivity and the full-cohort barrier before each next requirement. It reports observed overlap from original attempt intervals; a live snapshot cannot establish terminal completion.

Research preparation and launch are separate explicit commands in [research execution](../docs/research-execution.md). They reuse the measured native core while enforcing a frozen analysis plan and fresh exact-prefix confirmation roots. No research builders have been started.
