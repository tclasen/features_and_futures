# Multiple projects, experiments, and runs

This repository is a portfolio of evaluation workloads and evidence, rather than one application's repository.

## Identity and ownership

| Entity | Location | Meaning |
| --- | --- | --- |
| Project revision | `projects/<project-id>/revisions/<revision-id>/` | Application type, specification, stack, requirements baseline, acceptance baseline, starter source |
| Experiment revision | `experiments/<experiment-id>/revisions/<revision-id>/` | Exact project reference, model/harness/instruction matrix, execution and measurement policies |
| Run | `runs/<experiment-id>/<run-id>/` | One execution of one experiment revision, including its task sequence and complete evidence |
| Shared infrastructure | `orchestrator/` | Reusable runner code, independent of any one project or run |
| Cross-run analysis | `reports/` | Explicitly scoped comparisons with provenance |

Use lowercase hyphenated catalog IDs, explicit revisions such as `v001`, and unique run IDs such as `pilot-001` or `repeat-001`. These are naming conventions. Actual Workboard pilot executions are tracked under `runs/instruction-effects/`.

A project can support several experimental designs. An experiment revision can have many independent runs. A builder's identity is the tuple of experiment ID, run ID, and builder ID; task and attempt IDs are scoped to that run.

## Repetition versus variation

An exact repeat uses the same project and experiment revisions and replays the same frozen task packets and suite revisions from fresh builder repositories. Record the source run and replay checkpoint; it is not enough to reuse the application name.

A variation changes a project or experiment revision, records its parent, and describes the changed factors and rationale. Application type changes use a new project ID. New requirements or stack choices use a new project revision. Changed instruction text, model matrix, scheduling, or metric definitions use a new experiment revision.

Do not edit a definition already used by a started run. Publish a new revision instead. Draft definitions may be edited before freezing. A run's manifest and definition snapshots remain immutable after start; later observations, task rounds, and clarifications are recorded with explicit lineage.

Exploratory runs can invent successive shared features. Their evolving requirements and acceptance tests live inside that run and are committed before each round. To confirm a candidate breakpoint, snapshot the observed task sequence into a new project revision and use a new experiment revision for repeated confirmation runs. Link them to the exploratory run and candidate checkpoint; do not overwrite its original baseline.

## Preparation workflow

1. Copy `templates/project/` into a new project revision and select its app, stack, starter, requirements, and tests.
2. Copy `templates/experiment/` into a new experiment revision. Resolve its project reference, matrix, treatments, and policies; document the parent and variation if any.
3. Copy `templates/run/` into a unique run directory. Choose pilot, exploratory, or confirmation purpose and exact revision references.
4. Resolve all preparation fields and snapshot source definitions and treatments with Git revision and content hashes. Harness versions and images must be pinned for that execution; log differences from earlier runs.
5. Provision fresh independent builder repositories outside this master repository, verify isolation/accounting, and only then mark the run started.

The initial pilot covers all 18 configurations and three shared tasks. The pilot calibrates instrumentation and evidence analysis; it is not a maintainability finding. Whether the main experiment proceeds automatically after the pilot remains unresolved.

## Evidence and comparisons

Every event, request, task packet, source archive, and result carries run identity and relevant definition hashes. Acceptance tests, pricing snapshots, builder archives, and decisions are run-owned. A global mutable task list or suite must not change older results.

Within a run, all configurations share its workload and stack. Different runs may use different application types and requirements without requiring the entire repository to stay functionally identical.

Run reports go inside their run. Cross-run reports enumerate input runs and changed factors, distinguish repeats from variations, and preserve failed attempts. Analysis changes create new reports with analysis provenance rather than rewriting raw evidence.

Do not mount catalogs, other runs, or master archives into builder sandboxes. Copy only the assigned starter source, treatment, and task contract. Keep live credentials and session state outside tracked files; preserve source snapshots and Git bundles in the run archive.

The Workboard engineering pilot runner is implemented and uses run-owned frozen definitions. JSON templates remain preparation checklists for other projects and designs. The current pilot-specific entry points accept a unique `--run` ID; shared components support later workload runners.

## Native builder histories

Publish each builder's original history on namespaced checkpoint branches in the same master remote. Keep the corresponding run archive on `main`; use [the builder-history helper and procedure](builder-histories.md) to preserve and verify commits. These branches organize histories but do not isolate readers. Only the PM receives publication access, and builder sandbox isolation must account for repository visibility.

Exact repeats also pin the runtime versions, model mappings, and relevant execution policies of the source run. Record unavoidable environment differences and report them; an intentional upgrade is a variation rather than an unchanged repeat.
