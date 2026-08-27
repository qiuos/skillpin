# Publish SkillPin 0.1.12

## Goal

Deliver the workbench typography and scrollbar refresh as the next stable SkillPin patch release through the repository's GitHub Release workflow.

## What I already know

* The user explicitly asked to archive the completed UI task and publish a new version on August 27, 2026.
* The UI task has been archived; its product changes are committed in `bf87cd4` (`feat: refine workbench typography and scrollbars`).
* The current root package version is `0.1.11`; `docs/releasing.md` specifies a patch bump when no version is given.
* Formal deliveries are private GitHub Releases, not public npm registry publications.
* The prior formal release followed the same process for `0.1.11`.

## Requirements

* Raise the root package and lockfile version to `0.1.12` using the repository's npm versioning flow.
* Create an annotated `v0.1.12` tag pointing at the version commit.
* Run all documented release checks from the version commit:
  * `npm ci`
  * `npm run format:check`
  * `npm run lint`
  * `npm run typecheck`
  * `npm test`
  * `npm run build`
  * `npm run pack`
  * `npm run verify-package`
  * `npm run test:package`
* Push `main` and the version tag to `origin` to trigger the GitHub Release workflow.
* Verify the completed GitHub Release contains exactly the matching `skillpin-0.1.12.tgz` asset.
* Do not run `npm publish`.

## Acceptance Criteria

* [x] Root `package.json` and `package-lock.json` both declare `0.1.12`.
* [x] An annotated `v0.1.12` tag points to the version commit on `main`.
* [x] All documented local release checks pass from that version commit.
* [x] `main` and `v0.1.12` are pushed to `origin`.
* [x] The GitHub Release workflow succeeds and release `v0.1.12` has the sole asset `skillpin-0.1.12.tgz`.
* [x] No public npm registry publication occurs.

## Definition of Done

* The tag, package version, GitHub Release, and archive all agree on `0.1.12`.
* The release archive is downloadable from GitHub Releases.
* Release task and session journal are archived after delivery verification.

## Out of Scope

* New product functionality beyond the already committed UI refresh.
* Pre-release versions and public npm publication.
* Pushing any unrelated work.

## Technical Notes

* Release process: `docs/releasing.md`.
* Release automation: `.github/workflows/release.yml`.
* Prior equivalent task: `.trellis/tasks/archive/2026-08/08-27-publish-skillpin-0-1-11/`.
* User did not specify a version, so stable SemVer patch `0.1.12` is selected from current version `0.1.11`.

## Decision (ADR-lite)

**Context:** The user approved publishing a new version immediately after archiving the UI refinement task, with no explicit version number. The documented release procedure defaults to a stable patch bump and publishes via GitHub Releases only.

**Decision:** Create, verify, and publish SkillPin `0.1.12` as a GitHub Release; do not publish to npm.

**Consequences:** This creates a version commit and annotated `v0.1.12` tag, pushes both to `origin`, and triggers the GitHub Actions Release workflow.

## Approval

The user explicitly requested publication on August 27, 2026: “ok ，提交归档之后发布新版本”.

## Local Validation

All checks passed from version commit `765ffe6` (`0.1.12`):

* `npm ci`
* `npm run format:check`
* `npm run lint`
* `npm run typecheck`
* `npm test` (16 test files, 86 tests passed)
* `npm run build`
* `npm run pack`
* `npm run verify-package`
* `npm run test:package`

The local packaging run produced exactly `artifacts/skillpin-0.1.12.tgz` (189,854 bytes; SHA-256 `36e68ec158ae942cb8906edb82211a3bc78e565351fb6bcd4eba37809f6af15e`). No `npm publish` command was run.

## Release Verification

* Pushed `main` and annotated tag `v0.1.12` over authenticated SSH after the configured HTTPS remote could not reach GitHub on port 443. The remote `main` and tag dereference both resolve to `765ffe671522ed1c8c871815f238ae8a5c0433b8`.
* GitHub Actions Release workflow run `33054744266` completed successfully on August 27, 2026.
* GitHub Release `v0.1.12` is published with title `SkillPin v0.1.12`; it is neither a draft nor prerelease.
* The release has exactly one asset: `skillpin-0.1.12.tgz`, 190,374 bytes, GitHub digest `sha256:c3e4c4849ae99c9019a5731504e56d93278a610c83110c81e5aa76e232bf239c`.

## Spec Update Assessment

This release follows the existing P11 delivery contract and `docs/releasing.md` without introducing an interface, workflow, or durable coding convention. No `.trellis/spec/` update is needed.
