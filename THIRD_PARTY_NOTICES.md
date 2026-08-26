# Third-party notices and runtime dependency inventory

The installable SkillPin archive bundles its authored CLI/core runtime and the following runtime dependency:

| Package | Version | License | Purpose                                                |
| ------- | ------- | ------- | ------------------------------------------------------ |
| `yaml`  | 2.9.0   | ISC     | Parse local SkillPin configuration and skill metadata. |

The browser bundle includes the application dependencies declared by `packages/web/package.json` (React, React DOM, TanStack Virtual, React Markdown, and Remark GFM) as compiled production assets. Their resolved versions and license metadata are recorded in the repository `package-lock.json`; their source packages are not shipped as `node_modules` in the SkillPin archive.

SkillPin itself is distributed as `UNLICENSED`. A private-registry operator must ensure that their intended distribution terms and any third-party notice obligations are satisfied before publishing internally.
