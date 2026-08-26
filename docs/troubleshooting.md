# Troubleshooting

## `skillpin: command not found`

Confirm Node.js 22+ and the installation prefix. For a prefix install, run the command through npm:

```sh
npm exec --prefix ./skillpin-tools -- skillpin --help
```

## The browser does not open

Use `--no-open`, copy the printed `http://127.0.0.1:<port>` address into a browser on the same computer, and keep the CLI process running. The address is loopback-only by design.

## Port unavailable

Choose another port with `--port <1..65535>` or stop the process already using that loopback port. SkillPin never falls back to a non-loopback interface.

## Static page or assets are missing

Reinstall from a fresh archive produced by `npm run pack`. `npm run verify-package` validates the bundled `dist/main.js`, Vite `dist/web/index.html`, and referenced assets before installation.

## Link permissions on macOS and Linux

SkillPin uses directory links for project changes. Ensure the selected project and configured source directories are readable and writable by the same local account. If a source is on a protected or network-mounted location, choose a local accessible path or adjust its filesystem permissions.

## Windows link permissions

Windows directory symlinks can require Developer Mode or elevated privileges. SkillPin's runtime also supports a Junction fallback where the platform permits it. Hosted three-OS CI is green, but the native Windows case where directory-symlink creation is denied and Junction fallback is used remains a **deferred manual P10 validation**; it has not been claimed as complete. Perform that validation on the target Windows environment before relying on this behavior operationally.

## Existing files are not changed after reinstall

That is expected. Install, upgrade, reinstall, and uninstall do not overwrite a valid SkillPin configuration or project manifest. Unsupported future-schema files are preserved for a newer compatible SkillPin version.
