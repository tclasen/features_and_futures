# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workspace-import.spec.mjs >> 100 empty workspace imports create nothing and matching exports round-trip as independent owners
- Location: experiments/instruction-effects/revisions/research-v016/preflight/task030-action-role-suite/workspace-import.spec.mjs:67:2

# Error details

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://127.0.0.1:62392/", waiting until "load"

```

```
Error: Channel closed
```

```
Error: browserContext.close: Target page, context or browser has been closed
```