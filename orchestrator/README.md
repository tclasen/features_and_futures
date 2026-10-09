# Shared orchestration

Future reusable runner code belongs here. It should accept an explicit run directory and resolved manifest, rather than assume one global project, acceptance suite, or builder matrix.

Run-specific mutable state belongs under the run directory. Live builder repositories remain separate sibling repositories, identified by both run and builder ID, and isolated in their own sandboxes.

This directory currently contains documentation only; no runner is implemented.
