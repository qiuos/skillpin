# Release version 0.1.7

## Goal

Publish the completed source-reload and typography fix as the next stable private SkillPin GitHub Release.

## What I already know

* Root package version is currently `0.1.6`.
* The release guide specifies that an unspecified release increments the patch version, so the proposed version is `0.1.7` with Git tag `v0.1.7`.
* Formal releases are private GitHub Release deliveries; they must not publish to the public npm registry.
* A release requires the version commit, matching annotated tag, package archive `artifacts/skillpin-0.1.7.tgz`, then `git push origin main --follow-tags` to trigger the GitHub Release workflow.
* The preceding fix is committed on `main` as `014ef23` and its task is archived.

## Assumptions (temporary)

* “发布新版本” means a formal GitHub Release, including pushing the version commit and tag to `origin`.
* The intended version is the default patch bump: `0.1.6` → `0.1.7`.

## Open Questions

* Confirm the default patch version and remote publication scope before creating and pushing the immutable release tag.

## Requirements (evolving)

* Create stable release version `0.1.7` and matching `v0.1.7` tag.
* Run the documented release verification suite from the version commit.
* Create and validate the exact release tarball.
* Push `main` and the tag to `origin` so GitHub Actions creates the private release.

## Acceptance Criteria (evolving)

* [x] Root `package.json` reports `0.1.7`.
* [x] The version commit `d4e1958` has annotated tag `v0.1.7`.
* [x] All documented release checks pass: `npm ci`, format, lint, typecheck, tests (86), build, pack, package verification, and package smoke test.
* [x] `artifacts/skillpin-0.1.7.tgz` passes package verification and isolated install smoke test.
* [x] `main` and `v0.1.7` are pushed to `origin`; GitHub Actions run `33044134274` completed successfully and created the private GitHub Release with its archive asset.

## Definition of Done

* Version, commit, tag, and artifact use the same stable SemVer value.
* No public npm publish is performed.
* GitHub Release workflow is triggered by the pushed tag.

## Out of Scope

* Additional product changes.
* A prerelease version.
* Public npm registry publication.

## Technical Notes

* Release process: `docs/releasing.md`.
* Delivery verification (2026-08-27): GitHub Release `v0.1.7` is published (not draft or prerelease) with one asset, `skillpin-0.1.7.tgz` (189,727 bytes; SHA-256 `12945f3653bed3b6f490c9cb344153dcbe12abca7bb8b5c0c795adcf9f3b0be2`).
* No public npm publish was performed.

## Approval

* 2026-08-27: User approved version `0.1.7` and the formal GitHub release/push scope.
