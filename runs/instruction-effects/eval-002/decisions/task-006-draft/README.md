# Unfrozen priority round

This is PM-only preparation for task 006. It is not dispatched and is not part of the task-stream hash. The replacement cohort must first finish task 005. Before freezing, verify the public requirements against all assertions, review the positive and negative browser fixtures, list every declared phase, and commit the final frozen round.

The draft includes four priority checks and 17 retained task-005 acceptance checks (21 total), a high-priority current restart sentinel, and the prior task-005 archived sentinel's Normal default. Existing upgrade checks use the prior frozen suite, so the migration assertion is explicitly in current acceptance. Preserve the task-005 data and exact prefix in the fixture. Avoid copying or modifying builder implementation source.

The superseding audit in ../../preflight/priority-fixtures/verification-superseding-audit.json verifies both synthetic form/fetch modes pass21acceptance checks plus1sentinel observation each, and six intentional defects each execute and fail1named assertion. Earlier negative commands selected no tests; their false verification is explicitly superseded and retained. These synthetic observations do not prove a native process restart or SQLite upgrade; real submission validation must still cover those phases.
