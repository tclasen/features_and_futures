# Sandbox storage policy

Stopping an sbx sandbox does not release its virtual disk. Pilot010 exhausted the host volume after obsolete sandboxes accumulated. Its original events, incomplete accounting, raw interrupted Git objects and working files remain archived; it is superseded rather than resumed under changed rules.

New runs may freeze `archive-before-remove-v1` in their manifest. Before each builder starts a model attempt, the PM requires at least64GiB of free space on the host evidence volume. Falling below that reserve interrupts the round as PM infrastructure failure; it does not reject a builder or release later requirements.

After preserving source and independently recoverable Git history, the PM removes rejected application sandboxes and superseded accepted deployments by exact name. The control verifies archived source/history checksums and bundle validity, and checks a preserved SQLite backup or an explicit rejected raw-data record. It records retirement evidence before removal and completion afterwards. Keep the active builder workspace and latest accepted deployment; they remain private. Never run a global prune or remove another thread's resources.

At terminal closure preserve each builder's relevant working files, histories, transcripts and accounting, and each application's persistent data/logs before removing its sandbox. If Git is corrupted, retain raw objects and the error as data alongside earlier valid archives; never invent a replacement history. Interrupted cleanup lists resources still needing preservation. Apply storage policy changes only through a new frozen run.
