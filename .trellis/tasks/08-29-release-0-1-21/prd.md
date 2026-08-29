# Release version 0.1.21

## Goal

Publish the completed skill-list flicker fix as SkillPin v0.1.21 through the repository's tag-triggered GitHub Release workflow.

## What I already know

* The last released version is `0.1.20`, represented by Git tag `v0.1.20` and the root `package.json` version.
* The completed fix was committed as `d556416 fix: stop skill list measurement flicker` and its Trellis task has been archived.
* `.github/workflows/release.yml` validates that a pushed stable `v<major>.<minor>.<patch>` tag exactly matches `package.json`, then builds, verifies, and uploads `artifacts/skillpin-<version>.tgz` to a GitHub Release.

## Decision (ADR-lite)

**Context**: This is a backward-compatible bug fix following v0.1.20.

**Decision**: Release the next patch version, `0.1.21`, by updating the root package version, validating the package artifact, committing the release metadata, creating annotated tag `v0.1.21`, and pushing the commit and tag to the configured remote.

**Consequences**: The GitHub Actions release workflow will create or update the GitHub Release and attach the built tarball. This workflow does not publish to the npm registry.

## Requirements

* Update the root package version to `0.1.21` and keep the package lock consistent.
* Build, verify, and smoke-test the publishable tarball.
* Commit the release metadata, create annotated tag `v0.1.21`, and push the branch and tag so the release workflow runs.

## Acceptance Criteria

* [x] `package.json` and `package-lock.json` identify version `0.1.21`.
* [x] `npm run pack`, `npm run verify-package`, and `npm run test:package` pass.
* [ ] An annotated `v0.1.21` tag is pushed to the configured remote.
* [ ] The tag-triggered GitHub Release workflow has been started successfully.

## Out of Scope

* npm registry publication; the repository release workflow only builds a GitHub Release asset.
* New product changes beyond the committed flicker fix.

## Technical Notes

* Release workflow: `.github/workflows/release.yml`.
* Release asset path: `artifacts/skillpin-0.1.21.tgz`.
* Release preflight passed: `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run pack`, `npm run verify-package`, and `npm run test:package`.
