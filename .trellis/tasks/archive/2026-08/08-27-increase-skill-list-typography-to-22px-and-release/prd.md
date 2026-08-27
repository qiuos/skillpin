# Increase skill list typography to 22px and release

## Goal

Make the skills catalog easier to read by increasing its list typography to 22px, then ship the change as a new stable release.

## What I already know

* The catalog row currently renders the skill name at 18px and its one-line summary at 16px in `packages/web/src/styles.css`.
* The existing skills-workbench contract specifies compact catalog typography (18px name / 16px summary / 44px controls); this task intentionally supersedes that visual baseline and will update the contract if the implementation is accepted.
* The current root package version is `0.1.14`; the release procedure uses `npm version patch`, producing `0.1.15` and tag `v0.1.15`.
* A pushed stable `v*` tag runs the GitHub Actions Release workflow, which builds, validates the package, and creates or updates the GitHub Release.

## Requirements

* Set both the skill name and its one-line summary in every catalog row to `22px`.
* Keep the 启用／移除 action button text at its current size.
* Preserve list virtualization, ellipsis behavior, explicit actions, and responsive layout.
* Verify the codebase and packaged application before releasing.
* Create a patch release using the repository’s documented release process, expected to be `0.1.15` / `v0.1.15`.


## Technical Approach

* Update the catalog-row name and summary typography tokens in `packages/web/src/styles.css` from `18px` / `16px` to `22px`, without changing the action control token.
* Update the P8 skills-workbench typography contract and its test expectation to the new `22px` row typography baseline.
* Run the repository release verification sequence, then use `npm version patch` to create the `0.1.15` version commit and `v0.1.15` tag, and push the commit plus tag to trigger the GitHub Release workflow.

## Decision (ADR-lite)

**Context**: The catalog list is hard to read at its 18px name / 16px summary sizes.

**Decision**: Use 22px for both the skill name and one-line summary; leave the action button typography unchanged.

**Consequences**: The list is more readable but less dense; row height and responsive behavior must be verified.

## Acceptance Criteria

* [ ] The skill-name and summary text in each catalog row use a computed 22px font size.
* [ ] The 启用／移除 action button font size is unchanged.
* [ ] List rows remain usable, with no overlapping controls at supported layouts.
* [ ] Formatting, linting, type-checking, tests, build, and package verification pass.
* [ ] A version commit and matching `v0.1.15` tag are pushed, and the Release workflow is triggered.

## Definition of Done

* Tests added/updated where applicable.
* Lint, type-check, test, build, and package checks pass.
* The documented release workflow has been triggered with a matching package version and tag.

## Out of Scope

* Redesigning the skills workbench or changing Skill Detail typography.
* Altering behavior of filters, selection, virtualization, or enable/remove actions.
* Publishing a public npm package.

## Technical Notes

* Affected implementation: `packages/web/src/styles.css` (`.skill-row__name`, `.skill-row__summary`, `.skill-row__action`).
* Relevant contract: `.trellis/spec/frontend/skills-workbench-foundation.md`.
* Release procedure: `docs/releasing.md`; `.github/workflows/release.yml`.
