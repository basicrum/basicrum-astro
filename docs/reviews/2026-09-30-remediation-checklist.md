# Remediation checklist for the 2026-09-30 review

Source: `2026-09-30-codex-gpt-6-astra.md`. One commit per item. All eight
items were completed on 2026-09-30. When an item
is done, tick it here and update the status list in the review record (and in
`2026-09-28-fable-5.1.md` for the two carried-over findings).

- [x] 1. P1 Release workflow: verify and package without secrets; publish in a
      separate job that alone receives the npm credential.
- [x] 2. P2 Release workflow: refuse tags whose commit is not on `main`.
- [x] 3. P2 Boundary tests: parse module syntax instead of a line regex; cover
      multi-line, side-effect and dynamic imports, declaration files and nested
      directories; resolve relative paths before checking membership.
- [x] 4. P2 Consent tests: positive cookie controls before withdrawal, forced
      bootstrap replay after withdrawal, the missing lifecycle cases, and a local
      collector fixture that captures unload beacons.
- [x] 5. P2 Reject duplicate registrations during configuration with an
      actionable error; cover both mixed orders and repeated same-mode use.
- [x] 6. P2 Delayed first beacon: flush the pending beacon on early exit before
      the unload fields are added, clear the timer, keep the consent guard, assert
      the minimum delay, document the behaviour.
- [x] 7. P3 Convention scripts: full semver grammar, provenance `sourceCommit`
      and notice digest cross-checks, fixed-string matching.
- [x] 8. P3 Core-split checklist: dependency wiring, adapter tests, convention
      scripts, declaration exports, and the endpoint's documented exception.

## Round 2

Source: `2026-09-30-codex-gpt-6-astra-followup.md`. Same rules: one commit per
item, tick here and update that record's status list when done.

- [ ] 9. P1 Enforce consent at Boomerang's final send boundary so a send queued
      before withdrawal is never transmitted; prove it with a control.
- [ ] 10. P1 Delayed beacon: deliver synchronously when the timer fires and
      track actual delivery, so an exit after expiry cannot mislabel the visit;
      document the exit-before-load bundle limitation.
- [ ] 11. P2 Declaration scanner: import attributes, `import x = require()`,
      string-aware comment stripping, nested adapter files; self-tests; honest
      README wording.
- [ ] 12. P2 Minimum-delay assertion on collector receipt timestamps; drain
      late traffic between local-collector tests.
- [ ] 13. P2 Early-decision test that calls the real helper before the loader;
      hostname fixture with host-only and parent-domain cookie controls.
- [ ] 14. P3 Single credential step in the release workflow; status and
      documentation consistency; README limitations paragraph.
