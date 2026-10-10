# Features and Futures

This repository is the control plane and evidence archive for evaluating how AI coding agents affect a codebase's ability to support continued development. The application is an experimental workload; its commercial value and the elegance of individual submissions are secondary to measured delivery performance over time.

The primary question is whether stronger software engineering instructions improve later development speed, cost, and reliability enough to justify their upfront investment. Model and harness comparisons provide additional context.

## Experiment matrix

Each evaluation has one project manager (PM) agent and 12 independent builders under the current hosted-only design: every combination of the following factors.

| Factor | Configurations |
| --- | --- |
| Model | Luna 6.0 with medium reasoning; Sol 6.1 with medium reasoning |
| Harness | Codex CLI; Pi coding agent |
| Instructions | No added SWE guidance; minimal SWE guidance; maximum emphasis on SWE best practices, maintainability, and clean code |

The current design resolves these to `gpt-6-luna` and `gpt-6.1-sol`, both with medium reasoning. Earlier pilots used an 18-configuration matrix including local `gpt-oss:120b`; their frozen definitions and all failures remain archived. The user selected hosted-only models for subsequent pilots and evals on 2026-10-09. Exact provider, image and pricing provenance is frozen in each run manifest.

Within each run, all builders implement the same application, use the same PM-selected technology stack, receive the same ordered development tasks, and face the same PM-maintained Playwright acceptance criteria. Each has an independent repository and Git history inside its own Docker sandbox. Builders execute in parallel within each shared task round, receive one development task at a time and cannot inspect other builders or PM-only materials.

The PM invents successive features, freezes requirements and acceptance tests before dispatch, collects timing and token evidence, verifies cumulative behavior, and preserves every builder's work in this master repository. Functional scope stays aligned; implementation, architecture, code size, and version-control choices may diverge. Those differences are part of the experiment.

Continue adding features and revising earlier behavior without a source-line stopping threshold. Seek sustained, measurable instruction effects or practical equivalence within each model/harness pairing, then confirm candidate findings with independent repeats. Freeze the evidence method before the main experiment; source size is contextual data, not a target.

## What belongs here

- PM-owned requirements, decisions, task history, and the cumulative acceptance suite.
- Frozen run configuration, instruction profiles, pricing references, and measurement definitions.
- Raw events, model usage, failures, verification artifacts, and reproducible reports.
- Full source snapshots and recoverable Git history for each builder, kept outside builder sandboxes.

## Multiple projects and iterations

Keep application workloads in `projects/`, versioned experimental designs in `experiments/`, and independent executions in `runs/<experiment-id>/<run-id>/`. Repeat a frozen design with a new run ID; vary requirements, project type, or experiment factors through explicit new revisions. Each run preserves its own definitions, task sequence, acceptance suite, builder histories, and evidence.

The PM work lives on `main`. Builder implementations are published as namespaced GitHub branches with their original independent Git histories, while source snapshots and recoverable bundles are indexed in the run archive. See [repository organization](docs/repository-layout.md), [builder history publication](docs/builder-histories.md), and [reusable templates](templates/README.md).

Read [AGENTS.md](AGENTS.md) for PM behavior, [the experiment protocol](docs/experiment-protocol.md) for execution rules, [measurement definitions](docs/measurement.md) for timing, cost, and DORA adaptations, and [builder instruction profiles](docs/builder-instructions.md) for the instruction treatment.

## Current state

Pilot 015 completed five shared Workboard task rounds: all 12 configurations accepted all 60 checkpoints. Independent audits verify all 637 native request receipts, exact request coverage, peak overlap of 12 builders and five lock-step release barriers. The readiness report passes. Every request used its assigned hosted model with medium reasoning. Costs are hypothetical OpenRouter reference estimates, not subscription charges.

Earlier pilots and their failures remain archived. Pilot 008 verified the original three-task parallel workload. Later runs exposed PM deployment, storage and asynchronous acceptance-test defects; verified corrections use new revisions. Pilot 014 completed all five rounds but retains two requests with unknown usage and therefore fails complete-accounting readiness. Pilot 015 repeats its frozen inputs with fresh independent repositories.

The main study has a [preregistered evidence method](docs/evidence-analysis.md) and an [explicit preparation and execution procedure](docs/research-execution.md). Eval-001 started under explicit user authorization and retained 35 accepted checkpoints before a provider HTTP503left one native cost unknown. All350calls and original histories are preserved; its24sandboxes were verified and removed. It cannot support a finding under research-v001. The fresh discovery replacement eval-001-repeat-001 replays the same frozen inputs from independent starter roots; it is not repaired original accounting or a confirmation run. Five pilot tasks verify experiment operation; they do not establish maintainability or instruction effects. Deployment reliability observations are limited to the declared 30-second windows, and incident recovery time is unavailable when no incident occurs.

The PM must maintain [evidence-linked lessons](docs/lessons-learned.md) and [their append-only journal](lessons/records.jsonl), then verify the controls adopted from them. See [the pilot runtime](docs/pilot-runtime.md) and each run's immutable reports for supporting evidence and limitations.

The fresh discovery replacement also interrupted at task003with one uncounted HTTP503:371requests reconcile and35checkpoints passed. All24obsolete resources were verified and removed. [A prospective missing-evidence proposal](docs/proposals/research-v002-missing-evidence.md) is prepared for review, with twelve checks of conservative interval calculations. It has not changed the active research-v001method or established a finding.

Eval-002 completed ten common rounds (120 accepted checkpoints), then was superseded during task 11 after a confirmed PM observer timing defect. Its terminal 1,632 requests reconcile; 1,621 native receipts verify and 11 costs remain unknown. All 24 obsolete sandboxes were archived, independently restored, and removed. Original attempts and superseding attribution are preserved. [Research-v003](experiments/instruction-effects/revisions/research-v003/analysis-plan.json) is frozen for fresh eval-003, correcting asynchronous observers with unchanged analysis and stopping rules. The authorized evaluation remains incomplete.

Eval-003 is prepared from the verified pilot-015 starter with twelve fresh roots and eleven frozen shared rounds. Task packets1–11 and suites1–10 are inherited exactly; task11 uses the verified prospective observer correction. The frozen plan, manifest, price provenance and all eleven rounds were committed before native dispatch. No instruction-effect finding is established.

Before eval-003 launch, delayed fixtures also verified return positions, search and the whitespace revision, expanding its frozen prefix to fourteen shared rounds. All PM fixture processes ended before native execution.

Eval-003 was superseded after eight common rounds and105 accepted checkpoints. A directed delayed-query fixture proved a false acceptance in its frozen but undispatched task13 search test. All1,120 requests reconcile:1,111 native counters verify and9 remain unknown. All24 obsolete sandboxes were archived, independently restored, and removed. Research-v004 is frozen after24/24/27 full browser variants, four directed800ms rendering controls,167 PM regression checks and native runtime/isolation verification, correcting positive readiness anchors and cumulative project-search selection; analysis and stopping rules remain unchanged. No candidate finding or completed evaluation is claimed.

Eval-004 is prepared from the clean pilot015 starter with12fresh isolated repositories and15frozen shared rounds. First12suites and first14public packets match eval003 exactly;13–15 use the new verified observer/query controls. Task016 remains a prospective draft; no comparative candidate has been inspected.

Eval-004 completed its first five common rounds:60accepted checkpoints with original unknown native costs retained. Native task006 is active. The common prefix now includes17frozen rounds; deletion and export gates pass30and25variants. No comparative candidate has been inspected. See its checkpoint005 report and task016/017validation decisions.

Eval-004 was superseded after ten common rounds and130accepted checkpoints. Its1,726requests reconcile:1,712native counters verify and14costs remain unknown. All24obsolete resources were archived, independently restored and removed. Exact archived b004/b008sources pass41cumulative checks, upgrade sentinels and native restarts under prospective action synchronization; original rejections and all exposure remain. Research-v005 is a prepared, unfrozen replacement with169PM regression checks and pinned native runtime/isolation verification. Browser gates are still pending; no candidate finding or completed evaluation is claimed.
