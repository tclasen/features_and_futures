# Long-horizon coding agent evaluation

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
- Full source snapshots and recoverable Git history for each builder, accessible only to the PM.

## Multiple projects and iterations

Keep application workloads in `projects/`, versioned experimental designs in `experiments/`, and independent executions in `runs/<experiment-id>/<run-id>/`. Repeat a frozen design with a new run ID; vary requirements, project type, or experiment factors through explicit new revisions. Each run preserves its own definitions, task sequence, acceptance suite, builder histories, and evidence.

The PM work lives on `main`. Builder implementations are published as namespaced GitHub branches with their original independent Git histories, while source snapshots and recoverable bundles are indexed in the run archive. See [repository organization](docs/repository-layout.md), [builder history publication](docs/builder-histories.md), and [reusable templates](templates/README.md).

Read [AGENTS.md](AGENTS.md) for PM behavior, [the experiment protocol](docs/experiment-protocol.md) for execution rules, [measurement definitions](docs/measurement.md) for timing, cost, and DORA adaptations, and [builder instruction profiles](docs/builder-instructions.md) for the instruction treatment.

## Current state

The authorized engineering pilot now has a measured runner, isolated inference gateway, native token accounting, a three-task Workboard acceptance suite and recoverable builder histories. Pilots 001 through 003 retain aborted PM infrastructure attempts. Pilot 004 verified private workspaces, databases and native pre-parser accounting but was superseded after a PM test defect and a provider accounting gap. Pilot 005 closed incomplete at 19 of 54 checkpoints, with all 1,797 requests reconciled. Pilots 006 and 007 were prepared but never dispatched. Pilot 008 passed all36 hosted-only checkpoints with parallel builders and verified lock-step requirement barriers. Its467 native requests reconcile, all53 submitted histories restore, the original report reproduces exactly, and all36 accepted source trees pass the stronger independent suite. Earlier failures and measured recovery remain archived. Long-horizon readiness gates remain pending before the main eval. See [the pilot runtime](docs/pilot-runtime.md), [evidence decisions](docs/evidence-analysis.md) and run reports for actual status. The indefinite main experiment remains separate and requires its statistical evidence method to be frozen.

The PM must maintain [evidence-linked lessons](docs/lessons-learned.md) and [their append-only journal](lessons/records.jsonl) during the pilot and every follow-on evaluation, and verify the controls adopted from them.
