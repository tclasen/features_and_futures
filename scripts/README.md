# PM utilities

[archive-builder-history.py](archive-builder-history.py) preserves and imports original builder commit histories under unique checkpoint branches. See [the publication guide](../docs/builder-histories.md) for usage and scope.

This utility is separate from the future evaluation runner. It does not start builders, publish automatically, capture uncommitted source, or perform recovery actions.

[scan-publication.py](scan-publication.py) checks current non-ignored files and reachable Git objects against known local provider/GitHub credentials, host account routing IDs and temporary gateway leases. It recursively decodes ZIP, gzip and tar evidence, and imports each native bundle into a disposable bare repository to inspect its objects. Run `python3 scripts/scan-publication.py` before publication; any finding or inspection failure blocks publication. Findings identify locations without printing matched values. This is a concrete gate, not proof against every possible unknown secret format. Keep credential sources outside the repository.
