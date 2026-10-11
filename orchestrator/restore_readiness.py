"""Exact PM-only prospective project-restore observer transformation."""
import re

RESTORE_CLICK = re.compile(
    r"await (projectRow\(page,\s*(?:'[^']*'|[A-Za-z_]\w*)\)"
    r"\.getByRole\('button',\s*\{\s*name:\s*'Restore project',"
    r"\s*exact:\s*true\s*\}\))\.click\(\);"
)


def with_restore_readiness(source):
    """Add only a button-disappearance wait after each project restore click.

    Preserve the initial two diagnostic waits' formatting and leave existing
    waits untouched. No test assertions, task requirements, or builder code
    are removed or changed.
    """
    def add_wait(match):
        locator = match.group(1)
        wait = f'await expect({locator}).toHaveCount(0);'
        if source[match.end():].lstrip().startswith(wait):
            return match.group(0)
        separator = '\n    ' if any(
            f"'{title}'" in locator for title in ('Archive lifecycle', 'Archive tasks')
        ) else ''
        return match.group(0) + separator + wait

    return RESTORE_CLICK.sub(add_wait, source)


def verify_restore_only_delta(original, prospective):
    """Require identical file inventory and the exact declared transformation."""
    original_files = {p.relative_to(original) for p in original.rglob('*') if p.is_file()}
    prospective_files = {p.relative_to(prospective) for p in prospective.rglob('*') if p.is_file()}
    if original_files != prospective_files:
        raise ValueError('Prospective restore observer changes suite file inventory')
    changed = []
    for name in sorted(original_files):
        before = (original/name).read_bytes()
        after = (prospective/name).read_bytes()
        expected = (with_restore_readiness(before.decode()).encode()
                    if str(name).endswith('.spec.mjs') else before)
        if expected != after:
            raise ValueError(f'Unexpected prospective observer delta: {name}')
        if before != after:
            changed.append(str(name))
    return changed
