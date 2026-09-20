## What & why

<!-- One short paragraph. -->

## Invariant check

- [ ] Does not reduce agent capability or restrict what it may choose/recommend
- [ ] Produces awareness (facts + review areas), not verdicts
- [ ] Silent on routine work — scenarios added/updated proving zero false positives (`tests/scenarios/`)
- [ ] Fail-open preserved (errors never block a session)
- [ ] Hot path stays local / LLM-free / network-free (no yaml/sqlite imports on hook path)
- [ ] User-facing strings added to both `locales/en` and `locales/zh-CN`
- [ ] The design question answered: this preserves **human agency**, not measurement of human activity

## Testing

<!-- How was it verified? New/updated tests? -->

## Docs

<!-- Which docs were updated (or why none needed)? -->
