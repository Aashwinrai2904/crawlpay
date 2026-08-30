---
name: Bug report
about: Something doesn't work the way this repo's own docs/code say it should
title: ""
labels: bug
assignees: ""
---

**What happened**

A clear description of the bug.

**Where**

Which package (`packages/core`, `packages/middleware`, `packages/dashboard`, `packages/wp-plugin`)
and, if you know it, the file/function.

**Steps to reproduce**

1.
2.
3.

**Expected behavior**

What you expected instead, and why (a doc reference or the code's own comments are great evidence
if you have them).

**Environment**

- OS:
- Node version (`node --version`):
- pnpm version (`pnpm --version`), if relevant:
- PHP version (`php --version`), if `packages/wp-plugin`-related:
- WordPress version, if `packages/wp-plugin`-related:

**Anything else**

Logs, screenshots, whatever's useful. If this touches payment verification or bot classification,
please also check [SECURITY-REVIEW-NOTES.md](../../SECURITY-REVIEW-NOTES.md) first — it might
already be a known, tracked gap rather than a new bug.
