# Experiment protocol

## Design and interpretation

The current experiment uses the hosted-only 2 × 2 × 3 matrix described in [README.md](../README.md). Earlier pilots retain their original 3 × 2 × 3 definitions. Future experiment revisions may explicitly vary the matrix, application type, or requirements. Follow [repository organization](repository-layout.md) to keep project revisions, experiment revisions, and runs separate. Within a run, each configuration follows the same task sequence from identical starter contents. Compare instruction profiles within each fixed model/harness combination before pooling results.

One trajectory per configuration supports descriptive comparisons, not strong causal conclusions. Repeated runs begin with fresh repositories and contexts, use the same frozen workload, and record seeds and scheduling. Show results by task checkpoint and codebase size as well as aggregate totals. Preserve instruction overhead: additional prompt tokens and engineering work are part of the treatment.

The PM may generate new features during a run, but must select them before inspecting that round's comparative outcomes. Use a preregistered feature progression that revisits existing behavior and adds cross-cutting requirements, persistence changes, and integrations. Do not cherry-pick tasks to reward a particular architecture. Product details remain a PM preparation choice.

## Run preparation

Create a versioned run manifest before issuing task 1. It must contain:

- Experiment ID and revision, project ID and revision, unique run ID, run purpose, parent/source run, definition snapshots and hashes, protocol revision, repeat/seed, all selected configuration IDs, and exact model/provider mappings. Record the Ollama model digest, quantization, serving configuration, hardware, and supported reasoning settings.
- Exact harness releases, built-in prompts and defaults where inspectable, immutable Docker image digests, tools, dependency versions, shared stack and starter commit.
- The shared operational contract and exact treatment bytes, including how each harness loads them. Audit inherited instructions, home-directory configuration, plugins, memories, and automatically loaded files.
- CPU, GPU, RAM, disk, network policy, model endpoint access, quotas, concurrency, warm-up and cache policies. Log host contention and API rate limiting.
- Context/session continuity, compaction, restart, dependency-install, and permitted-tool policies. Keep these consistent across instruction profiles and disclose unavoidable harness differences.
- Token-accounting method, tokenizer versions, OpenRouter pricing snapshot and provider mappings, and treatment of caches, reasoning, retries, and missing usage.
- Feedback format, incident policy, observation windows, and recovery rules. The initial experiment has no spending cap or fixed retry limit; use subscription access and record hypothetical reference cost.
- Source-size counting rules as contextual measurements, checkpoint schedule, parallel hosted builders within a round, synchronized release barriers, and the evidence-based stopping and confirmation policy.
- Acceptance-suite environment, deterministic data/reset rules, deployment promotion rules, and metric definitions.

Use the latest stable harness available when preparing a new experiment revision, then pin it throughout execution and exact repeats. Upgrading a harness for a later iteration creates an explicit variation. Model labels alone are insufficient identifiers. If a model is unavailable or a combination unsupported, record it and resolve it before execution; never silently substitute or describe an incomplete matrix as complete.

Publish a manifest hash and store it with every task and outcome. Preparation remains incomplete until accounting and isolation pass a smoke check.

## Isolation and repository ownership

The PM owns this master repository. Each builder owns a separate sibling repository and independently creates its commits, branches, and history. Start with identical tracked contents and stack constraints; exclude treatment files from starter equivalence checks.

Each builder container mounts only its own repository and treatment. It may access necessary package registries and its designated model endpoint through controlled networking. It cannot access sibling paths, PM files, another sandbox, shared conversation memory, a Docker socket, or broad PM credentials. Enforce these boundaries with container and network configuration, not prompts alone.

The PM can inspect all repositories and run exact submissions in separate validation environments. Shared caches, if used, must not contain source, prompts, transcripts, or builder-generated artifacts. Local Ollama access must not expose other sessions or management controls.

## Task rounds and feedback

For each round, commit a common task packet containing an ID, prior requirements checkpoint, feature or revision requirements, public acceptance criteria, stack constraints, any declared operational limits, suite revision/hash, and submission contract. Create tests at the same time. Test expected behavior through public interfaces rather than assuming a builder's internal structure.

Builders receive the same requirements and criteria, but not the PM's test source or cross-builder observations. The cumulative Playwright suite includes all prior requirements. Require stable shared launch, health, and test-fixture interfaces so tests can target each implementation identically.

A submission identifies its exact commit. The PM records submission time, snapshots tracked and relevant untracked contents, and checks that the tested tree matches the submission. Run clean builds and tests with independent fixtures, fixed browser/runtime versions, and reset persistent state. Retain command output, traces, screenshots, test IDs, and suite hashes.

Feedback contains expected behavior, the builder's own observed failures, and reproducible steps, with no design recommendations, prescribed fixes, or information from competing implementations. Apply the same recovery and diagnostic rules to every configuration. Shared requirement clarifications go to everyone and are versioned. Builders remain responsible for implementing repairs and creating their implementation commits; all retries belong to the original task's timing and cost totals.

The PM may reject an attempt that fails the frozen requirements or cumulative acceptance criteria and choose correction in place, a direct PM reversion, or a builder-performed reversion. Preserve useful changes for bounded defects; revert destructive or broadly incorrect attempts to the last accepted checkpoint, or the identical starter checkpoint when no task has yet been accepted. Record the failure evidence and reason for the chosen action rather than judging the attempt by subjective code style.

Before any reversion, stop the affected builder, archive its rejected source tree (including relevant untracked changes) and recoverable Git history, and verify the archive. Preserve rejected commits in that history even if the active working branch is restored. Record the pre-action and post-action commit IDs and source-tree hashes, archive checksums, actor, action, and timestamps. A repository reversion does not itself change the active evaluation deployment; any deployment rollback must be recorded separately.

Give every correction, reversion request, or restart instruction in a fresh builder conversation containing the original task, its assigned instruction treatment, relevant requirements, and its own factual failure evidence. The PM may restore the repository directly but must leave implementation of the correction to the builder. Never reset task accounting or discard earlier attempts when restarting.

Advance the whole cohort after the round is resolved. Faster builders cannot receive advance requirements. Record barrier waiting separately from their own development time.

Continue correction or restart attempts until the builder passes; there is no fixed retry limit. Keep the cohort at the current requirements checkpoint while any builder remains unresolved. After ten consecutive attempts with the same acceptance failures, notify the user and continue recording and retrying. A notification does not authorize changing requirements, weakening tests, dropping the configuration, or erasing failures.

## Pilot and evidence-based stopping

The original three-task pilot covers setup, a feature addition, and a change to earlier behavior across all12 hosted configurations. The longitudinal readiness pilot adds project renaming and an incrementally frozen task-renaming fifth round. It validates isolation, subscription access, request accounting, acceptance testing, and recovery. Whether to proceed automatically into the main run after the pilot is unresolved.

The main workload continues feature additions and revisions without a source-line threshold. Look for sustained later task differences or practical equivalence among the three instruction treatments within each of the four hosted model/harness combinations. Initial practical margins are 20% for task time or reference cost and 10 percentage points for first-submission failure rate. Confirm candidate findings with independent repeats of the frozen workload.

Before the main run, freeze an evidence method that addresses uncertainty, repeated looks, multiple comparisons, and confirmation. The practical margins alone are not a statistical stopping test; the exact median intervals and append-only confirmation ledger are implemented and frozen in research-v001. Do not declare a breakpoint merely because one task exceeds a margin.

Continue recording source size as context using a pinned counting tool and file classifications. Exclude dependencies, generated and vendored code, build output, fixtures, tests, documentation, lockfiles, and blank/comment-only lines from production source counts. Record file counts and test size separately; never encourage padding.

## Master repository layout

Create these paths as execution produces real artifacts; they are not implemented by this documentation.

| Path | Contents |
| --- | --- |
| `projects/<project-id>/revisions/<revision-id>/` | Application, requirements/test baselines, and starter source |
| `experiments/<experiment-id>/revisions/<revision-id>/` | Versioned research design and project reference |
| `runs/<experiment-id>/<run-id>/manifest.json` | Frozen execution configuration and hashes |
| `runs/<experiment-id>/<run-id>/definitions/` | Frozen project, experiment, and treatment copies |
| `runs/<experiment-id>/<run-id>/requirements/` | Ordered frozen run task packets |
| `runs/<experiment-id>/<run-id>/acceptance/` | Run-owned cumulative Playwright suite |
| `runs/<experiment-id>/<run-id>/events.jsonl` | Append-only PM event stream |
| `runs/<experiment-id>/<run-id>/usage.jsonl` | Request-level accounting evidence |
| `runs/<experiment-id>/<run-id>/pricing/` | Frozen pricing snapshots and mappings |
| `runs/<experiment-id>/<run-id>/tasks/` | Attempts, results, and traces |
| `runs/<experiment-id>/<run-id>/builders/` | Source snapshots, Git bundles, and archive indexes |
| `runs/<experiment-id>/<run-id>/decisions/` | Run-specific choices and clarifications |
| `runs/<experiment-id>/<run-id>/reports/` | Reproducible run analyses |
| `reports/` | Explicitly scoped cross-run comparisons |
| `orchestrator/` | Shared runner infrastructure |
| `templates/` | Reusable draft scaffolding |

Copy each builder's work into the master archive after every submission and accepted checkpoint, including relevant untracked source and changes from failed attempts. Preserve complete recoverable Git history with bundles and a source snapshot; a remote link, submodule pointer, or commit hash alone is insufficient. Index artifacts by run, builder, task, attempt, commit, tree hash, and checksums. Periodically verify restoration and archive correspondence.

Publish original builder commit histories as separate namespaced branches in the master remote using [the builder-history procedure](builder-histories.md). These references complement, rather than replace, the run's source snapshots and bundles. Do not merge implementations into `main`.

Large artifacts may use a pinned Git LFS policy, provided their contents remain retrievable as part of this repository. Never archive live credentials or dependency directories. Keep full evaluation archives PM-only, and never mount the master repository into builder sandboxes.
