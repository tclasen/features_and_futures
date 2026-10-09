# Builder instruction treatments

These profiles are experimental inputs, not instructions for the PM. Freeze their exact content before a run. Task descriptions must not smuggle maintainability guidance into the no-guidance condition.

## Shared operational contract

Every builder receives the same contract, with its own repository identity and task packet substituted:

> Work only in your assigned repository on the current task. Implement the supplied requirements using the specified technology stack. Preserve the previously required behavior. Use the shared launch and health interfaces. Manage your own Git history and submit an exact commit plus the required run commands. Work within the supplied tool and resource limits. If verification fails, use the factual feedback to revise your submission. Do not access PM files, other builders, or their artifacts. Do not work ahead on undispatched tasks.

Isolation is enforced by infrastructure. This common contract states task mechanics and functional obligations; it does not prescribe code style, architecture, testing strategy, or refactoring.

## None

Add no software engineering guidance beyond the shared contract and task packet. Do not create an empty-looking guidance file that actually contains PM practices. Harness-native instructions remain present where unavoidable and must be captured in provenance. This condition means **no added SWE instructions**, not a harness without built-in behavior.

## Minimal SWE guidance

Use exactly this additional text:

> Keep changes focused and readable. Use clear names and avoid needless duplication. Verify the changed behavior with appropriate checks before submitting.

## Maximum SWE guidance

Use exactly this additional text:

> Prioritize maintainability and clean code throughout the project. Before editing, understand the current design and identify the smallest coherent change that meets the requirements. Keep responsibilities clear, modules cohesive, and dependencies explicit. Use descriptive names, consistent conventions, and simple interfaces. Separate business rules from presentation, persistence, and external integrations where that makes future changes easier.
>
> Prefer straightforward implementations over speculative abstractions. Remove meaningful duplication without coupling unrelated concerns. Keep functions and modules focused; avoid hidden state and surprising side effects. Handle invalid inputs, errors, and resource cleanup explicitly. Preserve compatibility and data integrity when changing persistence or interfaces.
>
> Add and maintain useful automated tests for business rules, important boundaries, and regressions. Use the appropriate formatter, static analysis, and type checks for the stack. Run relevant checks and address failures before submission. Refactor touched areas when doing so makes the current change and later development easier, while preserving behavior and keeping the work reviewable.
>
> Keep dependencies intentional, configuration explicit, and setup reproducible. Document non-obvious decisions, public contracts, and operational requirements. Remove dead code and stale documentation. Keep commits coherent and describe the reason for each change. Revisit earlier design decisions as requirements grow. Do not pad the codebase, build speculative frameworks, or optimize for line count.

## Loading and contamination

Store profile source in the PM repository. Inject only the assigned profile using each harness's supported instruction mechanism, and capture the effective text and loading path. Avoid duplicate injection. Confirm that PM ancestors, host home directories, or bundled configuration do not add extra SWE guidance.

Builders may create their own documentation, tests, and instruction files as part of their independent work. Preserve and log those changes; do not inject another profile or silently edit their evolving instructions. Keep the PM-supplied profile immutable and record harness precedence so treatment drift can be analyzed.

Different harnesses may have different built-in prompts and tools. Treat this as part of the harness factor, document it, and compare instruction treatments within a fixed harness/model pair.
