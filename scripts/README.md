# PM utilities

[archive-builder-history.py](archive-builder-history.py) preserves and imports original builder commit histories under unique checkpoint branches. See [the publication guide](../docs/builder-histories.md) for usage and scope.

This utility is separate from the future evaluation runner. It does not start builders, publish automatically, capture uncommitted source, or perform recovery actions.

[scan-publication.py](scan-publication.py) checks current non-ignored files and reachable Git objects against known local provider/GitHub credentials, host account routing IDs and temporary gateway leases. It recursively decodes ZIP, gzip and tar evidence, and imports each native bundle into a disposable bare repository to inspect its objects. Run `python3 scripts/scan-publication.py` before publication; any finding or inspection failure blocks publication. Findings identify locations without printing matched values. This is a concrete gate, not proof against every possible unknown secret format. Keep credential sources outside the repository.

`python3 -B scripts/verify-retained-originals.py --run eval-004` rehashes closed incident receipts and archived committed/native source, independently restores both histories and the complete native working files/status, and writes a versioned verification artifact. It reads no live builder sandbox and does not infer missing token counters. Active attempts remain outside this closed-incident audit.

`python3 -B scripts/verify-closed-prefix.py --run eval-014 --audit runs/instruction-effects/eval-014/reports/closed-rounds-002-1319100e879c20a6` independently restores all committed and native originals in a verified closed audit, checks first-request packet/profile/contract delivery and task-start isolation, and writes a new proof without accessing live builders. It refuses existing outputs and audits outside the selected run. This does not infer missing counters or establish comparative readiness.
