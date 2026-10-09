# Run archive

Store executions under `<experiment-id>/<run-id>/`. Every repeat and pilot has a unique run ID, even when they use the same design.

Each run owns its frozen manifest, definition snapshots, ordered task packets, cumulative acceptance suite, pricing, events, usage, builder archives, decisions, and reports. Never reuse a prior run's evidence or live builder workspace.

Start from [the run template](../templates/run/README.md). A template does not mean an evaluation has started.

Published builder checkpoint histories use `builders/<experiment-id>/<run-id>/<builder-id>/<checkpoint-id>/...` branches in the same GitHub repository. Main contains the corresponding archives and indexes. See [the publication guide](../docs/builder-histories.md).
