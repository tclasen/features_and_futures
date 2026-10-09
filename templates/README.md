# Reusable scaffolding

Copy the [project](project/README.md), [experiment](experiment/README.md), and [run](run/README.md) templates into their catalog destinations.

Templates contain deliberately unresolved JSON values and are not runnable manifests. Replace IDs, select the app and stack, resolve model/access/pricing references, and validate preparation before marking a definition frozen or starting a run.

These templates do not override an experiment revision's recorded policies. Future experiments may vary the default matrix and protocol explicitly, while retaining provenance and isolation.
