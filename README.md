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

The main study has a [preregistered evidence method](docs/evidence-analysis.md) and an [explicit preparation and execution procedure](docs/research-execution.md). Native research builders have not started. Five pilot tasks verify experiment operation; they do not establish maintainability or instruction effects. Deployment reliability observations are limited to the declared 30-second windows, and incident recovery time is unavailable when no incident occurs.

The PM must maintain [evidence-linked lessons](docs/lessons-learned.md) and [their append-only journal](lessons/records.jsonl), then verify the controls adopted from them. See [the pilot runtime](docs/pilot-runtime.md) and each run's immutable reports for supporting evidence and limitations.
