## Summary

What changed and why — a couple of bullet points is usually enough. Link the issue this closes,
if there is one.

## Test plan

- [ ] `pnpm build && pnpm lint && pnpm typecheck && pnpm test` all pass locally
- [ ] For `packages/wp-plugin` changes: `vendor/bin/phpunit` passes (see its
      [README](../packages/wp-plugin/README.md#running-the-tests) for environment setup)
- [ ] Manually verified the actual behavior changed, not just that a test does — a screenshot, a
      curl transcript, or a one-line description of what you ran is worth including

## Anything reviewers should know

Security-sensitive area? Behavior change someone relying on the old behavior would notice? Call it
out here — see [SECURITY-REVIEW-NOTES.md](../SECURITY-REVIEW-NOTES.md) if this touches payment
verification, bot classification, or cross-tenant data access in the dashboard.
