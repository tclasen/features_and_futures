# Native context and compaction checks

The hosted-only pilot uses pinned Codex 0.162.0 and Pi 1.1.0. Codex's bundled model catalog lists Luna and Sol with a 272,000-token context window and a 95% effective-window setting. Pi's assigned model catalog declares 272,000 context tokens and 16,384 maximum output tokens. The pinned Pi source defaults to automatic compaction with 16,384 reserved tokens and 20,000 recently retained tokens. Source inspection does not independently establish which defaults a running custom provider selects.

PM-only stress fixtures exercised each of the four hosted model/harness pairs in separate Docker sbx sandboxes. Each fixture used a fresh context, its own gateway and lease, medium reasoning, four synthetic file reads and an early canary to preserve after compaction. The stress context was reduced to 32,768 tokens. Codex's explicit automatic-compaction threshold was 16,000; Pi reserved 16,384 and retained 2,000 recent tokens. These deliberate stress settings do not alter pilot 008 or establish the future main settings.

All four native CLI invocations returned successfully and preserved their exact canary. Codex made two automatic compaction requests per model, identified by `client_metadata.x-codex-turn-metadata.request_kind=compaction`; its public JSON output did not emit corresponding compaction items. Pi completed one automatic compaction per model and emitted native start/end events. Every summary call passed through the metered gateway.

The [independent audit](../runs/instruction-effects/pilot-008/preflight/context-stress/1791568365194493000/independent-audit.json) verifies all 30 native receipts, hashes, request start/finish coverage and independently recomputed reference cost of USD 0.4114199. These are PM readiness costs, separate from the pilot's 467 builder requests. Raw requests, responses, harness output, synthetic fixtures, settings and exact probe/audit source are preserved alongside the report. All 74 infrastructure tests passed; audit checks reject missing finish evidence and omitted summary cost.

This verifies native compaction, continuation, one retained fact and accounting under reduced thresholds. Pi's output display reported truncation despite the request for complete reads. The fixture therefore does not establish untruncated tool-display fidelity or exhaustive long-context recall. Before main dispatch, freeze explicit per-harness context/output/reserve/compaction policy in its new manifest and capture runtime provenance. Do not rewrite historical settings or silently replace native compaction with PM summaries.

To repeat with new isolated fixture evidence:

```sh
python3 -m orchestrator.context_probe --run runs/instruction-effects/pilot-008
python3 -m orchestrator.audit_context --evidence <printed-evidence-directory> \
  --manifest runs/instruction-effects/pilot-008/manifest.json
```

The probe creates a new timestamped evidence directory, makes hosted subscription requests and stops its four sandboxes. It does not dispatch a development task or edit an implementation. Every repeat retains its own evidence and costs.
