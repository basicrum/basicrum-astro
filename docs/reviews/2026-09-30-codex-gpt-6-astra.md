# Second review: Codex (gpt-6-astra)

Date: 2026-09-30

Reviewer: OpenAI Codex CLI 0.155.1, model `gpt-6-astra`, reasoning effort
xhigh, session `01a0f2de-c8a7-7332-95d5-ca513e4981ff`. Invoked non-interactively
by Claude Fable 5.1 (`claude-fable-5-1`) with `codex exec -s workspace-write`
in a sandbox without network access, with instructions to treat tracked files
as read-only. Reviewed commit `0b6888963277dbd302247997741141d393efd062` on
`main`: the state after the core split, the end-to-end tests, and the CI and
release setup. The sandbox refused the fixture server's listening socket, so
the reviewer could not execute the browser suites; they passed locally and in
CI for the same commit. No tracked file was changed by the review. The text
below is the reviewer's final message, unedited.

## Status as of 2026-09-30

All findings are open. Update this list when a finding is resolved.

- P1 publishing credential exposed to the whole release job: open.
- P2 conflicting registrations choose a loader by order: open, carried over
  from the 2026-09-28 review.
- P2 optional delay suppresses short-visit unload measurements: open, carried
  over from the 2026-09-28 review.
- P2 consent guarantees lacking effective regression tests: open.
- P2 import-boundary tests miss ordinary violating imports: open.
- P2 release tags not checked against `main`: open.
- P3 convention checks can pass inconsistent metadata: open.
- P3 core-split checklist omits necessary changes: open.

## Verdict

Reviewed the current tree on `main` at `0b6888963277dbd302247997741141d393efd062`. The core split preserves the ordinary installation behavior, and additional static and SSR builds emitted the correct vendored asset. Conventions, type checking, lint, and all 16 unit tests passed, but the sandbox prevented the browser fixture server from starting. I would hold the `v0.1.0` tag pending the release-security fix and stronger consent verification; both previously open P2 runtime findings remain. The most important issue is that the release job exposes the npm publishing credential to dependency installation and verification code.

## Findings

### P1: The publishing credential is available throughout release verification

**Location:** `.github/workflows/release.yml:19`, `tools/verify-package.mjs:16`.

**Evidence:** The workflow defines `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` at job scope, before `npm ci`, tests, and package verification. The package verifier copies `process.env` into its subprocess environment and runs another `npm install` at line 63. Consequently, when configured, the publishing token is available to installation lifecycle scripts and verification subprocesses. The same job also has `contents: write` and `id-token: write`.

**Impact:** Code that only needs to build or verify the package receives release authority. This is a concrete credential-exposure risk, not evidence that any installed dependency is malicious.

**Recommendation:** Run installation, tests, and packaging in a job without publishing credentials or release write permissions. Publish the verified tarball in a separate job, exposing the npm credential only to the publication step.

### P2: Conflicting registrations still silently choose a loader by order

**Location:** `src/index.js:16`, `src/core/bootstrap.js:13`.

**Evidence:** Configuration does not check for another Basicrum registration. Additional Astro builds accepted both mixed-mode orders and emitted two bootstraps. Executing the generated scripts in an isolated VM produced:

```text
standard, consent: downloadsStarted=1, consentCallback="undefined"
consent, standard: downloadsStarted=0, consentCallback="function"
```

The first bootstrap sets `__basicrumInitialized`; the second returns without applying its configuration.

**Impact:** A preset and application can select conflicting collection policies without a configuration error. Standard-first starts collection even when the application adds a consent-mode registration. This reproduces the first review's open duplicate-registration finding. Standard mode's intentional immediate collection is otherwise correct.

**Recommendation:** Reject multiple active registrations during configuration, with an actionable error. Cover both mixed-mode orders and repeated same-mode registrations. Retain the runtime singleton guard.

### P2: The optional delay still suppresses short-visit unload measurements

**Location:** `src/core/bootstrap.js:45`, `tests/browser/integration.spec.js:121`, `README.md:116`.

**Evidence:** `WaitAfterOnload.is_complete()` returns only `this.complete`. An isolated execution of the current bootstrap returned:

```text
beforeTimer: pageLoad=false, unload=false
timerMs: 5000
afterTimer: pageLoad=true, unload=true
```

The unload input included `rt.quit`. Inspection of the vendored bundle confirms that its final `real_sendBeacon()` checks plugin completeness. The existing delay test asserts eventual delivery and `complete === true`, without checking elapsed time or an early exit.

**Impact:** The second open P2 remains in the current implementation: leaving during the delay can suppress both the initial and final measurement. The README describes a delay without warning about lost short visits. The existing test could also pass if the configured delay were shortened to zero.

**Recommendation:** Implement and test a consent-aware early-exit flush, including pending timers and BFCache behavior. Assert an actual minimum delay separately. Until fixed, document the short-visit loss. A real browser/collector reproduction could not be repeated in this sandbox; the gate behavior was reproduced directly.

### P2: Several consent guarantees lack effective regression tests

**Location:** `tests/browser/integration.spec.js:90`, `tests/browser/integration.spec.js:107`, `tests/e2e/consent-loader.spec.js:68`, `tests/e2e/fixtures/browser.js:75`.

**Evidence:** Cookie-removal tests assert that `RT` and `BA` are absent after withdrawal without first establishing that either exists. The fixtures use `127.0.0.1`; the bundled default cookie-domain calculation produces `0.1`, further undermining these as positive-cookie fixtures. Such absence assertions can pass with deletion broken.

The router test performs a swap between pages containing identical bootstrap text. Installed Astro 7.3.5 deduplicates inline scripts by their text, so this does not force bootstrap re-execution and establish that Basicrum's guard preserves withdrawal.

There are also no direct suite assertions for browser-side `setConsent()` false returns in disabled/standard mode, decisions made before the loader without subsequent replay, absence of a separate stored consent flag, or re-grant during the download-withdrawal race. Withdrawal before a pending delayed beacon and withdrawal followed by unload lack dedicated coverage.

**Impact:** Passing tests do not prove every claim in the README consent section. These are verification gaps; I did not establish corresponding failures in the current consent implementation.

**Recommendation:** Seed and verify cookies before withdrawal, including relevant host/domain variants. Explicitly re-execute the emitted bootstrap after withdrawal. Add the missing helper and lifecycle cases, and use a local collector with a positive unload control for navigation-related assertions. The current page-level interception does not establish complete unload capture.

### P2: Import-boundary tests miss ordinary violating imports

**Location:** `tests/unit/core.test.js:101`, `tests/unit/integration.test.js:59`, `README.md:213`.

**Evidence:** Both tests use a line-oriented regex requiring `from` on the import/export's first line. In-memory checks showed that it recognizes none of these forms:

```js
import {
  readLoaderSource
} from "./core/assets.js";

import "vite/client";
const adapter = import("../index.js");
```

The core predicate also accepts `./../index.js` because it starts with `./`. Core declaration files and nested directories are not inspected.

**Impact:** The README and invariants overstate enforcement: a violating import can pass both boundary tests. The current runtime imports are appropriately separated, but the tests do not reliably preserve that separation.

**Recommendation:** Parse module syntax, inspect static imports, re-exports, and dynamic imports, and resolve relative paths before checking directory membership. Include declarations and nested files. Separately enforce that the consent entry remains browser-safe.

### P2: Release tags are not checked against main

**Location:** `.github/workflows/release.yml:3`, `.github/workflows/release.yml:23`, `README.md:227`.

**Evidence:** The workflow runs for matching tag pushes and checks out the tag. Its release validation checks version equality, but no step establishes that the tagged commit belongs to `main`. The README explicitly defines a release as a tag on `main`.

**Impact:** A version-consistent tag on another branch can enter the publication workflow. Repository rules might prevent this operationally, but the workflow itself does not enforce the documented policy.

**Recommendation:** Before privileged publication, verify the tagged commit against the intended `main` policy, such as membership in its history. Restrict release execution through repository/environment rules as appropriate. This finding concerns missing enforcement, not an observed unauthorized release.

### P3: Convention checks can pass inconsistent metadata

**Location:** `tools/verify-version-consistency.sh:25`, `tools/verify-boomerang-provenance.sh:31`.

**Evidence:** The version regex accepts `00.1.0`, `1.2.3-01`, and `1.2.3-..`, while rejecting valid forms such as `1.2.3-alpha-beta`. The provenance script checks file hashes but never reads `sourceCommit`, and does not compare the bundle digest printed in the notices with the manifest. Its version search uses regex matching, so dots in `1.815.60` match arbitrary characters.

**Impact:** The current metadata agrees, but future malformed versions or stale provenance descriptions can receive a convention pass. The unit hash test complements the file checks; it does not validate the missing descriptive metadata.

**Recommendation:** Use a proper version parser or a complete supported-version grammar. Compare the corresponding notice and manifest fields explicitly, and use fixed-string matching where appropriate.

### P3: The future core-split checklist omits necessary changes

**Location:** `src/core/README.md:24`, `tools/verify-boomerang-provenance.sh:28`, `tests/unit/integration.test.js:7`.

**Evidence:** The checklist does not include adding the new core package as a dependency or updating adapter tests and convention scripts that reference the removed local core/vendor paths. It suggests dropping a provenance test from `integration.test.js`, although that test is already in `core.test.js`. The Astro endpoint also still contains a literal versioned vendor import at `src/boomerang-endpoint.js:4`.

**Impact:** Following the checklist alone leaves broken verification paths and incomplete package wiring. The statement that `assets.js` alone knows the vendored filename has an intentional endpoint exception that should be explicit.

**Recommendation:** Update the checklist for dependency installation, exports and declarations, vendor-relative paths, adapter tests, and convention ownership. Document the endpoint exception and retain its synchronization check.

## Checked and found sound

- The worktree started and finished clean at the requested commit. No tracked files were changed.
- Option validation requires an explicit loader, rejects unknown options and invalid types, validates collector URLs, and freezes normalized settings.
- Configuration serialization escapes `<` and Unicode line separators. Generated scripts parse as classic JavaScript.
- Build/dev defaults, explicit disabling, selected-loader injection, base-path construction, and prerendered route registration agree with the implementation and unit tests.
- Additional static and SSR consent builds emitted byte-identical Boomerang assets with SHA-256 `90e8a1c85949b10d43e441efc3f0545f95e4384e26ee3042344a8b2b4110589c`. Static output contained the expected `/metrics/` URL and consent wrapper.
- The current core has no Astro imports. The browser consent entry has no Node imports. The endpoint's explicit vendor dependency is checked against the catalogue.
- Direct helper/bootstrap checks confirmed server and unavailable-callback false returns, no queued early decision, callback invocation when available, a parameterized generator, and preservation of cleared configuration on forced replay.
- Existing tests meaningfully cover inert consent startup, denial followed by grant, repeated grants, withdrawal during download, initialized withdrawal, full reload/replay, and same-document navigation. The coverage limitations are identified above.
- The vendored wrapper clears configuration after loading starts, calls the available disable method, and attempts both Boomerang and fallback cookie removal. The bundle initializes from the matching configuration contract.
- The README accurately limits monitoring to full document loads, distinguishes static-host caching, and describes the inline bootstrap, external consent persistence, and inability to recall already-sent requests.
- Package exports include the runtime and declaration entries; the `files` list includes the core, vendor files, and licenses. Development dependencies are exactly pinned.
- Every workflow action reference is a full 40-character SHA with an adjacent version comment. CI and dependency review have read-only repository permissions; CodeQL's additional security-event permission is scoped to its analysis job.
- Publication is gated on a nonempty token and uses `--provenance --access public`. The release version check accepts `v0.1.0` and rejects `v0.1.1`.
- `npm test` runs conventions, types, lint, unit tests, and both Playwright projects. CI runs those checks and additionally verifies the packed package; tests run on Node 22 and 24. CI push coverage is restricted to `main`, so AGENTS.md's "every push" wording is broader than the workflow.
- Reading `verify-package.mjs` confirmed that it installs a real tarball, exercises both package entries, builds under a non-root base, checks the emitted asset name and bytes, and cleans up its temporary directory.
- The earlier review's packed-package gate is **done**. Version consolidation is correctly **partly done**, but its status explanation should mention the endpoint's remaining literal filename in addition to test literals. Both open P2 findings remain as described above. Stronger delay assertions, function-name decoupling, Astro-specific CSP guidance, fallback page-type assertions, broader browser base-path coverage, and fixed-port handling remain open. Installed Astro does hash injected `head-inline` scripts for its built-in CSP handling.

## Commands run

| Command | Outcome |
| --- | --- |
| `git status --short`, `git rev-parse HEAD`, `git branch --show-current` | Clean; requested commit; `main`. |
| `npm run conventions` | Passed ASCII, version, and vendored-file provenance checks. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test:unit` | Passed: 16 tests, zero failures. |
| `npm run test:browser` | Blocked before tests: `listen EPERM: operation not permitted 127.0.0.1:43211`. |
| `node_modules/.bin/playwright test --list` | Discovered 20 tests across the browser and e2e projects. |
| `sh tools/verify-version-consistency.sh v0.1.0` | Passed. |
| `sh tools/verify-version-consistency.sh v0.1.1` | Rejected the mismatched tag as expected. |
| `node --input-type=module` inspection/VM harnesses | Confirmed duplicate-order behavior, delay gating, import-regex gaps, helper/replay behavior, and metadata-check weaknesses. Independently found no non-ASCII authored text. |
| `ASTRO_TELEMETRY_DISABLED=1 node --input-type=module` build harnesses | Static and SSR builds passed; asset bytes matched. Both mixed-registration builds passed with two bootstraps. Identical repeated consent registrations produced one emitted bootstrap through Astro deduplication. |
| Initial additional build harness | Rejected a URL-valued `srcDir`; corrected to a filesystem string before the successful builds. This was a harness error. |
| `rg`, `nl`, `cat`, `head`, and `sed` source inspections | Reviewed the scoped source, tests, documentation, workflows, tools, and relevant installed Astro/Boomerang implementation. |
| `git status --short`, `git diff --exit-code`, `git diff --cached --exit-code` | Clean after review. |

## Review boundaries

- No browser test executed in this review because the sandbox denied the fixture server's listening socket. Static builds and VM checks do not replace browser lifecycle, cookie, unload, or BFCache validation.
- `npm run verify:package` was intentionally not run. Its implementation was reviewed; its successful execution at this commit is based on the maintainer's supplied local/CI result, not independent access to the linked run.
- Network access was unavailable. Remote action SHA/tag correspondence, upstream source provenance, npm availability, security-report contact availability, and GitHub repository protection settings were not independently verified.
- Vendored integrity checks establish agreement with the committed manifest, not independent reproducibility from the upstream repositories.
- The release workflow was inspected, not executed. GitHub release creation precedes npm publication, so a later npm failure can leave GitHub assets published without an npm release.
- Additional build output was confined to ignored `.test-output/` review directories. No release, publication, tracked-file edit, or external communication was performed.