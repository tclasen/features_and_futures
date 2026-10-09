"""Prepared, unused browser feedback renderer; retain raw evidence separately."""
import copy
import re

ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
FRAME = re.compile(r'^\s*>?\s*\d+\s*\|')
STACK = re.compile(r'^\s+at\s')


def public_message(message, pm_root):
    lines = ANSI.sub('', message).splitlines()
    # Playwright appends PM source frames and stacks after factual assertions.
    boundary = next((i for i, line in enumerate(lines) if FRAME.match(line) or STACK.match(line)), len(lines))
    factual = '\n'.join(lines[:boundary]).rstrip()
    return re.sub(re.escape(str(pm_root))+r'[^\s\)\]]*', '[PM evidence path]', factual)


def browser_diagnostics(diagnostics, pm_root):
    result = copy.deepcopy(diagnostics)
    for item in result:
        if 'test' in item and 'errors' in item:
            item['errors'] = [public_message(error, pm_root) for error in item['errors']]
    return result
