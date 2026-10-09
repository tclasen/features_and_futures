# Experiment revision template

Copy this directory to `experiments/<experiment-id>/revisions/<revision-id>/`.

Resolve `definition.json`: reference an existing exact project revision, select the matrix, pin the supplied instruction profiles by content, and freeze the policies before dispatch.

For an unchanged repeat, reuse this definition and create a new run. For a variation, create a new revision and document its parent and changed factors. Never relabel changed configurations as identical-design repeats.

The default captures the agreed initial experiment. Docker sbx is selected for sandboxing with public publication; its runtime availability and network isolation still need verification. Exact model IDs, subscription access, pricing, and the statistical evidence method remain unresolved. Practical effect thresholds alone do not define a valid stopping test; specify the confirmation and repeated-look procedure before the main run.
