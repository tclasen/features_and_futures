# Main-run readiness decisions still to freeze

This is preparation guidance, not a change to any active pilot. Pilot 005 retains its frozen suite, legacy feedback, complete-native accounting requirement and verifier. A successful three-task pilot supplies infrastructure evidence, not proof of maintainability effects.

## Missing provider receipts

Pilot 004 request 01ac2eaf-459d-4901-9478-21870d552847 ended during a function-argument delta without terminal usage. Its hidden tokens cannot be reconstructed by tokenizing visible output or replaying the request. Preserve unknown usage, the raw stream and all task time. A strict complete-native run cannot pass with that gap. Do not turn that unknown request into a zero-cost request or silently remove its trajectory from a comparison.

Before main dispatch, freeze whether an incomplete receipt halts the cohort, and whether replacement inference is allowed after diagnosis. Any continuation must preserve original and replacement exposure. Exact total cost is unavailable wherever a receipt is missing; the sum of measured requests is a known lower bound. Report missing request IDs and coverage alongside that bound.

A possible future analysis can retain every independent run using intervals: complete cost is [known sum, known sum]; incomplete cost is [known sum, unbounded]. Bound each paired ratio conservatively, then apply the preregistered order-statistic interval to lower and upper endpoints separately. For every possible true completion of the missing costs, the resulting interval contains the complete-data interval. This avoids assuming that missingness is independent of configuration. A separate unused implementation now exists in `orchestrator/proposals/censored_cost_v1.py`, with six checks including agreement with the complete-data method and conservative containment. It still requires a versioned run policy and preregistration before use. Unknown endpoints must widen uncertainty and can leave decisions unresolved. This proposal is not used by any current pilot or by orchestrator/analysis.py.

## Acceptance coverage

Project v004 corrects the confirmed undeclared-wrapper locator requirement. Project v005 is separately prepared to add assertions for already-public task-title trimming, default All filter, initially open tasks, task creation order and filtering archived tasks. Validate unchanged archived submissions against a separate suite revision and label those observations separately; do not rewrite pilot acceptance or leak competing code to builders. A corrected main suite must be frozen before dispatch.

## Feedback and process timing

The prepared native parser/schema renderer is inactive pending the user's answer. Freeze a common adopted feedback version before a new run. Playwright failure messages may include PM source snippets and paths; a future renderer should retain factual expectations and observations while excluding PM source/stack snippets. Preserve full reports PM-side. Verify this boundary before main dispatch.

The current attempt wall boundary includes small observer/gateway-drain overhead. A subsequent runner revision should also record exact harness-return and drain events, without erasing the current observed boundaries.

## Interpretation

Retain all five sandbox DORA adaptations, denominators and unavailable recovery times. Five-second post-promotion health checks give narrow stability evidence. Freeze broader equal checks and windows for the main workload. Application text-line counts include comments and blanks; they are context rather than an implementation-quality score. Independent repeated trajectories and the evidence decisions are required for strong instruction-effect conclusions. Hosted model aliases, subscription latency, provider caching and host contention remain documented confounds.
