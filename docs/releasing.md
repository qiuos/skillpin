# Releasing SkillPin

SkillPin formal releases are private package deliveries through GitHub Releases. They never publish to the public npm registry.

A formal release has four linked identities:

- a stable package version in the root `package.json`,
- the corresponding Git commit on `main`,
- a `v<version>` Git tag, and
- a GitHub Release with `artifacts/skillpin-<version>.tgz` attached.

For example, package version `0.1.1` must use tag `v0.1.1` and must attach `skillpin-0.1.1.tgz`.

## Prerequisites

- Start from an up-to-date, clean `main` branch.
- Use Node.js 22 or newer.
- Ensure GitHub Actions is enabled and the repository permits its `GITHUB_TOKEN` to write repository contents. The release workflow declares `contents: write` so it can create a GitHub Release and upload its asset.
- Do not release pre-release versions such as `0.2.0-rc.1`. Formal releases use exactly `major.minor.patch` stable SemVer versions.

## Choose the version

When no version is specified, increase the final (patch) segment of the current version by one:

```text
0.1.0 -> 0.1.1
```

Use npm to create the version commit and annotated Git tag:

```sh
# Default formal release: increment the patch segment.
npm version patch

# Explicit formal version, when one was specified.
npm version <major.minor.patch>
```

`npm version` updates the root package version, creates a version commit, and creates the matching `v<version>` tag. Confirm its output before continuing. Do not manually change the tag name or use a version that does not match `package.json`.

## Verify before publishing

Run the release checks from the version commit:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run pack
npm run verify-package
npm run test:package
```

`npm run pack` creates exactly one archive at `artifacts/skillpin-<version>.tgz`. `npm run verify-package` verifies its contents, and `npm run test:package` installs and smoke-tests the delivered archive.

## Push and publish

Push the version commit and its tag together:

```sh
git push origin main --follow-tags
```

Pushing a tag that begins with `v` starts the **Release** GitHub Actions workflow. Before it creates a release, the workflow verifies that:

1. the tag is exactly `v<major>.<minor>.<patch>`;
2. the tag version equals the root `package.json` version;
3. the package builds successfully; and
4. the generated archive passes package verification and an isolated install smoke test.

After those checks pass, the workflow creates the GitHub Release named after the tag and uploads the sole generated `skillpin-<version>.tgz` archive. Re-running a successful workflow replaces that release asset with the newly verified archive rather than creating a duplicate asset.

## Confirm delivery

On the GitHub Release page, verify all of the following:

- the Release and tag are named `v<version>`;
- the attached asset is named `skillpin-<version>.tgz`;
- its version matches `skillpin --version` after installing it according to the [installation guide](installation.md); and
- no package was published to the public npm registry.

## Failure handling

- **Checks fail before pushing:** fix the issue, run the checks again, then create a new version commit and tag. Do not move an existing release tag.
- **Tag and package version differ:** the workflow fails before creating a GitHub Release. Correct the versioning mistake with a new formal version; do not retarget the existing tag.
- **Transient GitHub Release upload failure:** rerun the same Release workflow after the underlying GitHub issue is resolved. Its asset upload is idempotent.
- **A release already exists:** the workflow updates the matching archive asset only after rebuilding and re-verifying it.
