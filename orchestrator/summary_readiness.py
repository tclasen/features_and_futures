"""Exact prospective summary extraction correction; never repair builder source."""

OLD_READER = '(await summary.innerText()).match(/\\d+/g).map(Number)'
NEW_READER = '(await summary.textContent()).match(/\\d+/g).map(Number)'


def with_summary_text(source):
    """Read the same DOM text that the preceding summary assertion checked."""
    if source.count(OLD_READER) > 1:
        raise ValueError('Ambiguous summary reader transformation')
    return source.replace(OLD_READER, NEW_READER)


def verify_summary_only_delta(original, prospective):
    """Permit only the declared extraction expression in the original suite."""
    before_files = {p.relative_to(original) for p in original.rglob('*') if p.is_file()}
    after_files = {p.relative_to(prospective) for p in prospective.rglob('*') if p.is_file()}
    if before_files != after_files:
        raise ValueError('Prospective summary observer changes suite file inventory')
    changed = []
    for name in sorted(before_files):
        before, after = (original / name).read_bytes(), (prospective / name).read_bytes()
        expected = (with_summary_text(before.decode()).encode()
                    if str(name) == 'return-order.spec.mjs' else before)
        if after != expected:
            raise ValueError(f'Unexpected prospective summary observer delta: {name}')
        if before != after:
            changed.append(str(name))
    return changed


def verify_restore_and_summary_delta(original, prospective):
    """Retain the inherited restore guard when preparing from the pilot starter."""
    from .restore_readiness import with_restore_readiness
    before_files = {p.relative_to(original) for p in original.rglob('*') if p.is_file()}
    after_files = {p.relative_to(prospective) for p in prospective.rglob('*') if p.is_file()}
    if before_files != after_files:
        raise ValueError('Prospective observer changes suite file inventory')
    changed = []
    for name in sorted(before_files):
        before, after = (original / name).read_bytes(), (prospective / name).read_bytes()
        expected = before
        if str(name).endswith('.spec.mjs'):
            source = with_restore_readiness(before.decode())
            if str(name) == 'return-order.spec.mjs':
                source = with_summary_text(source)
            expected = source.encode()
        if after != expected:
            raise ValueError(f'Unexpected prospective observer delta: {name}')
        if before != after:
            changed.append(str(name))
    return changed
