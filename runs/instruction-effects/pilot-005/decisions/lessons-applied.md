# Lessons applied to pilot-005

This is a retrospective adoption record added on 2026-10-09 after the user required durable learning. It does not change the frozen manifest, instruction treatments, task packets, acceptance outcomes or original measurements. The append-only [lesson journal](../../../../lessons/records.jsonl) contains evidence and verification limits.

The frozen manifest SHA-256 is `4c512fc3a9cdbb009a8eb72f01ae961ffe71d7480d5c0fb75e4d9eac1cb27639`. Exact inputs remain in [the manifest](../manifest.json) and its referenced definitions. A journal status describes its stated verification, not proof that the entire pilot is complete.

| Lessons | Controls used in this run | Evidence and limits |
| --- | --- | --- |
| L001 | Private sandbox SQLite storage; consistent accepted-state backups; real process restart checks | Per-attempt acceptance reports and deployment evidence. Later checkpoint upgrade verification is still in progress. |
| L002–L004 | Native failed-call accounting; exact provider/model provenance; uniquely leased gateway routes | Frozen definitions, raw request/response receipts and usage ledger. Missing terminal usage remains unknown and cannot pass the strict readiness gate. |
| L005 | Versioned v004 row-content locators | Real browser fixtures and immutable pilot-004 submission recheck; original rejected attempt retained. |
| L006 | Safe rejection cleanup that preserves opaque database bytes and always stops the sandbox | Original b004 attempt-003 cleanup archive and targeted cleanup checks. No acceptance criteria changed. |
| L007 | Recorded intervention stopped only b014 attempt-005 foreground server processes | Original stall time, requests and rejection retained; native harness resumed. A preventive watchdog is pending and has not been silently added to this run. |
| L011 | Native uncached reference cost primary; cache-aware cost separate; sandbox DORA limitations explicit | Frozen measurement definitions and analysis checks. Three tasks do not establish a maintainability effect; main experiment preregistration remains required. |
| L012 | Private builder filesystems, restricted network routes, independent archived Git histories | Per-builder isolation reports. Publication requires a separate scan of files, decoded archives and reachable history. |

## Deferred changes

L008 conservative missing-cost bounds, L009 revised feedback rendering and browser-source sanitization, and L010 stronger v005 cumulative acceptance coverage are prepared or pending. They are not active pilot-005 comparison rules. Validate them against raw evidence and immutable submissions, then adopt through an explicit new revision/run when they affect comparisons. Do not rewrite this pilot's outcomes or inject lessons into builder contexts.

Review this record and outstanding journal entries at shared checkpoints and after incidents. Append evidence-linked journal transitions as verification or adoption changes; preserve this record's historical claims through dated follow-up sections.

## Readiness review, 2026-10-09

Reviewed pending lessons while task-001 was still in progress, before the next shared round. Parser and browser feedback revisions and stronger acceptance assertions remain deferred from pilot-005. A separate b001 immutable submission smoke check passed v005 stage-1 normal and restart checks; it does not prove later-stage or full-corpus coverage. The historical and decoded-archive publication gate passed, and remote commit/checkpoint IDs were verified; see the publication preflight record. Further evidence snapshots require another scan.

The stage-one diagnostic corpus now covers all 18 accepted commits (72 normal checks and 18 real-restart checks). Later-stage coverage remains pending. An independent native-receipt audit verifies 1,026 recorded finished requests in its fixed live snapshot; it does not claim complete-run accounting. L007 now has an adopted observation-only liveness monitor in a separate journal; automatic recovery policy remains deferred.

L013 adds independent dispatch/usage/finish reconciliation and frozen-input hash checks. The live snapshot has one unresolved in-flight call and no discrepancies, so it does not claim complete-run coverage. A separate b007 stage-two immutable submission also passed the stronger suite's upgrade, eight normal and real-restart checks; the full later-stage corpus remains pending. Publication scanning now also excludes actual host account routing IDs under the existing runtime privacy rule.
