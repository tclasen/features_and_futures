# Measurement and evidence

## Principles

The PM independently observes timing, usage, tests, deployments, and incidents. Builders' narratives are not authoritative measurements. Measurements must be reproducibly derived from raw evidence using versioned rules.

The accounting algorithm can be deterministic; actual elapsed times, model behavior, and provider latency are observations and need not repeat identically. Do not promise deterministic inference or runtime outcomes.

## Timing

Use PM-controlled monotonic timestamps for duration measurements and UTC timestamps for chronology. Record clock identity and precision. For distributed hosts, do not subtract unrelated monotonic clocks; use an instrumented common observer or record synchronization uncertainty.

Capture task dispatch, actual execution start, model requests, submissions, validation start/end, feedback, acceptance, deployment, incident detection, recovery, and terminal failure. Record every attempt.

- **Builder attempt wall time:** submission or terminal stop minus execution start, including model waits, tool calls, and builder-run checks.
- **Task time to acceptance:** final cumulative-suite acceptance minus initial task dispatch, including retries and PM validation.
- **Builder execution total:** sum of attempt wall times, separately from queueing, PM validation, feedback delays, and round-barrier waiting.
- **Task time to deployment:** evaluation promotion minus initial dispatch.
- **Failure exposure:** elapsed time and cumulative cost through timeout or terminal failure; retain incomplete outcomes.

Use the same boundaries for every builder. Persist start/stop events even when the process crashes. Do not restart the task clock for repairs, reversions, fresh conversations, or restart attempts.

Record each rejected attempt and recovery action with its failure reason and evidence, actor (PM or builder), action (correction, reversion, or restart), original task and attempt IDs, pre-action and post-action commit IDs and source-tree hashes, archive checksums, and start/end timestamps. Link the next attempt to the rejected attempt and restored checkpoint when applicable. Preserve the original rejection even if a later attempt passes.

Keep all failed-attempt and retry token costs and builder execution time in the original task's cumulative totals. Record PM intervention time and any attributable PM model usage separately from builder execution and inference costs; intervention time remains part of dispatch-to-acceptance elapsed time. Report direct PM reversions separately from builder-performed reversions. A pre-deployment rejection or repository reversion is not a DORA change failure; link actual deployment rollbacks and recovery to their deployment and incident records.

## Tokens and deterministic reference cost

Freeze an OpenRouter pricing snapshot at run start, including retrieval timestamp, currency, provider/model identifier, units, applicable context tiers, and cache/reasoning rules. Store the raw response and checksum. The [OpenRouter support page](https://openrouter.ai/support/) and [prompt-caching documentation](https://openrouter.ai/docs/guides/best-practices/prompt-caching) explain why category and provider provenance matter.

For each request, retain the request ID, builder/task/attempt IDs, exact model mapping, serialized payload hash, response/usage evidence, tokenizer identifier/version where applicable, counting method, and finish status. Count every turn, repeated context, tool-result inputs, treatment instructions, retries, repair attempts, and any delegated model calls. Separate PM model usage from builder totals.

Prefer complete native usage counters when available; they can include reasoning that is not visible in returned text. A deterministic tokenizer may reproduce visible counts, but cannot recover hidden reasoning or provider-side additions. Record that limitation. Tokenizing concatenated transcript text is not equivalent to counting actual serialized requests.

For a snapshot whose category rates are in USD per million tokens:

```text
request_reference_cost_usd = sum(category_tokens × category_rate_usd_per_million) / 1_000_000
task_reference_cost_usd = sum(all attributable request_reference_cost_usd)
```

Use decimal arithmetic and a declared rounding policy. Categories must be disjoint: do not add reasoning tokens to completion tokens when already included, or charge cached inputs again as ordinary inputs. Tiered or non-token charges require the frozen pricing rules and separate fields. Report a common uncached reference estimate alongside cache-aware estimates if comparable complete evidence exists.

For local Ollama, this is an **OpenRouter-equivalent reference estimate**, not an invoice or the cost of owning/running the hardware. Keep actual API charges and infrastructure expenses separate. Do not assign zero reference cost merely because inference is local.

Resolve every model to an explicit OpenRouter pricing reference before evaluation. If no appropriate listing exists for Luna or Sol, or native usage is incomplete, mark the affected estimate unavailable or partial. Never invent a price, substitute an unrelated model, or label visible-only token counts as complete. A frozen, explicitly labeled proxy can be used only as a separately declared alternative analysis.

Cost derivation is repeatable given the same recorded usage and snapshot. Unsupported accounting cannot become deterministic merely by calling it so.

## DORA metrics in a sandbox

[DORA's delivery metrics](https://dora.dev/guides/dora-metrics/) concern production delivery. This experiment uses a persistent PM-controlled evaluation deployment per builder as a declared production surrogate. Report results as **sandbox DORA adaptations**, alongside ordinary task measures.

| Metric | Operational definition |
| --- | --- |
| Change lead time | Promotion time minus the PM-observed first appearance of each newly deployed commit. Report per-commit distribution; capture builder Git timestamps separately. |
| Deployment frequency | Recorded revision promotions divided by the declared observation duration. |
| Change fail rate | Promotions requiring incident intervention divided by all promotions. |
| Failed deployment recovery time | Verified restoration time minus recorded post-deployment failure detection. |
| Deployment rework rate | Incident-driven unplanned promotions divided by all promotions. |

Task dispatch-to-acceptance time is a separate development measure. Pre-acceptance test failures are not failed production deployments.

Record each promoted revision, prior revision, included commits, artifact digest, and task lineage. A promotion counts when it becomes the active evaluation revision; count it even if subsequent checks uncover a defect. Define equal post-deployment checks and observation windows before execution. Link incidents and repair promotions to their originating deployment. An unchanged revision restart is not automatically a new deployment.

Report nominal elapsed-time frequency and a separately labeled builder-active-time rate so cohort waiting is visible. Never compare differently denominated rates as the same metric. With a shared round barrier, nominal frequency is largely constrained by the experiment design.

If no deployment, incident, or denominator is observed, report the affected rate/duration as unavailable rather than zero. A nonempty deployment set with no incidents has zero observed failure rate but no recovery-time sample. A suite that prevents every defect from reaching the surrogate may yield little stability evidence; show that limitation.

## Longitudinal analysis

At every completed requirements checkpoint report:

- Time and reference cost per task and cumulatively, including failed attempts.
- First-submission acceptance, regression failures, repair attempts, and incomplete tasks.
- Sandbox DORA adaptations with event counts, windows, denominators, and unavailable values.
- Production source size, files changed, change size, test counts, and check duration as contextual indicators.
- Timing components, model latency, resource contention, context compaction, and accounting coverage.

Compare paired tasks across instruction profiles within each model/harness combination. Track early versus later task trends and repeated interactions with old features. Separate initial engineering investment from later repair and feature costs. Preserve every configured trajectory (18 in the initial design), including failures, rather than averaging only finishers. Scope comparisons to explicit project and experiment revisions, run IDs, and shared task checkpoints. Separate exact repeats from variations in application, stack, requirements, models, harness versions, or instructions.

Task complexity changes as features grow; raw time-versus-lines plots alone cannot establish a treatment effect. Document PM workload choices, harness defaults, hardware differences, provider caching, scheduling, and limited replication. Use repeated runs and uncertainty intervals when available; do not manufacture statistical certainty from one trajectory.

## Evidence contract

Use append-only, schema-versioned event and usage records. Every observation must identify experiment ID/revision, project ID/revision, run, builder, task, attempt, observer, timestamp, and relevant definition/configuration/test hashes. Deduplicate with stable event and request IDs. Represent corrections with superseding records.

Derived reports must identify analysis code revision, input hashes, pricing snapshot, exclusions, and missingness. Preserve raw transcripts securely with secrets redacted and redaction metadata recorded. Verify source archive checksums and restoration. A result without its underlying evidence is not a completed measurement.
