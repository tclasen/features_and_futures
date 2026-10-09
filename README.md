# Long-horizon coding agent evaluation

This repository is the control plane and evidence archive for evaluating how AI coding agents affect a codebase's ability to support continued development. The application is an experimental workload; its commercial value and the elegance of individual submissions are secondary to measured delivery performance over time.

The primary question is whether stronger software engineering instructions improve later development speed, cost, and reliability enough to justify their upfront investment. Model and harness comparisons provide additional context.

## Experiment matrix

Each evaluation has one project manager (PM) agent and 18 independent builders: every combination of the following factors.

| Factor | Configurations |
| --- | --- |
| Model | `gptoss:120b` through local Ollama; Luna 6.0 with medium reasoning; Sol 6.1 with medium reasoning |
| Harness | Codex CLI; Pi coding agent |
| Instructions | No added SWE guidance; minimal SWE guidance; maximum emphasis on SWE best practices, maintainability, and clean code |

These are requested model labels, not verified provider identifiers. Exact model mappings and supported reasoning settings must be recorded before execution.

Within each run, all builders implement the same application, use the same PM-selected technology stack, receive the same ordered development tasks, and face the same PM-maintained Playwright acceptance criteria. Each has an independent repository and Git history inside its own Docker sandbox. Builders receive one development task at a time and cannot inspect other builders or PM-only materials.

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

This repository provides protocol documentation, multi-project/run scaffolding, JSON preparation templates, and a builder-history archival helper. It does not yet implement evaluation orchestration, sandboxes, request measurement, acceptance tests, or analysis reports. No project or evaluation run has been created. Docker sbx is selected for builder isolation while this master repository remains public. Exact model access, sandbox runtime/network verification, and the statistical evidence method remain preparation work.
