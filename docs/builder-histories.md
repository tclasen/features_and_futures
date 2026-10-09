# Builder histories in one GitHub repository

The master remote is `https://github.com/tclasen/features_and_futures`. PM work lives on `main`. Each independent builder history appears on checkpoint-specific branches:

```text
builders/<experiment-id>/<run-id>/<builder-id>/<checkpoint-id>/head
builders/<experiment-id>/<run-id>/<builder-id>/<checkpoint-id>/branches/<source-branch>
```

Branches can have unrelated root commits. Import the original commits directly; do not squash, rebase, graft, or merge them into `main`. GitHub's branch selector exposes each implementation and its own history. Source branches with the same names remain distinct through the run/builder/checkpoint namespace.

## Archive and publish

Stop the affected builder while taking a checkpoint. Record the exact submitted commit and separately preserve any relevant uncommitted or untracked changes before reverting.

After an actual run manifest exists, the PM can use:

```sh
python3 scripts/archive-builder-history.py \
  --experiment instruction-effects \
  --run exploratory-001 \
  --builder sol-codex-maximum \
  --checkpoint task-001-attempt-001 \
  --repository /absolute/path/to/independent-builder-repo
```

These IDs are illustrative; they do not identify created runs. The helper:

- Validates run identity, independent repository placement, and unique checkpoint IDs.
- Creates and verifies a Git bundle containing all source refs plus HEAD.
- Archives committed HEAD source and records its commit, tree, checksums, and source refs.
- Imports HEAD and every source branch into new namespaced branches without changing source commits.
- Prints explicit refs for a normal push. It does not push, reset, clean, or modify the builder.

The snapshot contains committed source only. Relevant staged, unstaged, and untracked changes need a separate attempt archive before a recovery action; a history bundle does not preserve those changes. Tags and other refs remain recoverable in the bundle even when not exposed as GitHub branches.

Commit the archive and index on `main`, then push `main` and the printed checkpoint refs. Use normal explicit pushes; never `--mirror`, force-pushes, or a blanket push of every local branch. Checkpoints are append-only. Use a new checkpoint ID for another attempt, even if the builder has rebased, reverted, renamed branches, or rewritten its active history.

Rejected attempts receive checkpoints too. Preserve them before any PM or builder reversion. Keep bundles and snapshots in the run archive even after publication; remote branch pointers alone are insufficient evidence.

## Access and security

GitHub branches are not access-control boundaries. Any repository reader can inspect every builder implementation. Build sandboxes must never receive the master repository, its remote credentials, or its archives.

A private repository with access limited to the PM and trusted evaluators is the simplest publication policy. If public publication is intentional, builder networking must prevent access to the repository and its source through GitHub APIs, raw-content hosts, mirrors, search, and other retrieval routes. Enforce an allowlist of required model endpoints and package services; a prompt prohibiting browsing is insufficient. Check this with isolation probes before dispatch.

Use PM-only publication credentials scoped to this repository. Builders manage their independent local Git histories without master-remote access. Rules should prohibit modification or deletion of published checkpoint branches while allowing the PM to create new ones. Protect `main` under an agreed publication workflow and verify that the PM credential can actually use it. Git bundles are binary archives; do not rely on remote secret scanning to inspect their contents.

The user selected public publication with Docker sbx enforcing builder isolation. Verify network restrictions before a run, including direct GitHub, API, and raw-source retrieval. The installed legacy `docker sandbox` command reports that it has been removed; the actual sbx runtime and networking configuration still need preparation and testing. Do not treat Docker filesystem isolation alone as proof that public source is inaccessible.

Inspection after accepting the explicitly authorized collaborator invitation found:

- The repository is public and allows forking.
- The `main` ruleset blocks deletion and non-fast-forward updates and requires linear history. It permits normal direct pushes.
- The CLI account `tclasen-agent` has write access and no admin access.
- The collaborator roster lists `tclasen` as admin and `tclasen-agent` with write access.
- The listed ruleset applies to `main`, not the builder checkpoint namespace. Immutable checkpoint protection should be added by the repository administrator; the helper already refuses to overwrite local checkpoints.

These settings permit PM publication. They do not enforce cross-builder isolation themselves; the selected Docker sbx network restrictions must pass probes before builder dispatch. Keep public publication and sandbox enforcement recorded in each run. A failed permission check is a publication blocker, not permission to use a different account or broaden access silently.

## Restoration and verification

Recompute bundle/snapshot checksums and use `git bundle verify`. Restore a bundle into a new independent repository and compare commit/tree IDs to the index. Confirm published checkpoint refs resolve to the original commits. Verify repeated checkpoints do not overwrite earlier ones, and that same-named branches from different builders never collide.
