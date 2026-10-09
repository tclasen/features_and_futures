# Run template

Copy this directory to `runs/<experiment-id>/<run-id>/`. Fill in `manifest.json` with exact references and immutable provenance.

Before starting, snapshot both definitions, the assigned profile text, starter source, baseline requirements, and acceptance suite. Resolve model IDs, supported reasoning, harness/image versions, subscription access, pricing references, and runtime capacity. Verify isolation and request accounting. Draft nulls must be resolved or explicitly identified as unavailable where the protocol permits it.

As execution produces evidence, create:

```text
definitions/                     frozen project, experiment, and profile copies
starter/                         frozen application starter
requirements/                    ordered frozen task packets
acceptance/                      run-owned cumulative tests and fixtures
pricing/                         immutable reference-price snapshots
events.jsonl                     append-only observations
usage.jsonl                      request-level token accounting
tasks/<task-id>/attempts/<builder-id>/<attempt-id>/
builders/<builder-id>/            source snapshots, Git bundles, archive index
builders/<builder-id>/checkpoints/<checkpoint-id>/
                                 verified bundle, committed-source snapshot, ref index
decisions/                       run-specific decisions and clarifications
reports/                         derived run results
```

Builder IDs are scoped to a run. Give every live builder workspace a unique run-and-builder identity. Keep credentials outside tracked artifacts. Archive relevant rejected changes before reversions.

Do not prefill events, usage, results, hashes, or timestamps with invented observations. No execution has occurred merely because this template was copied.
