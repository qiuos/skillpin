# Usage

Start SkillPin for the current directory:

```sh
skillpin
```

Or select an explicit project and port:

```sh
skillpin --target /path/to/project --port 4312 --no-open
```

Useful commands:

```sh
skillpin --help
skillpin --version
```

The service listens only on `http://127.0.0.1:<port>`. `GET /` issues a short-lived bootstrap cookie; the browser exchanges it for an in-memory local-session credential. Do not copy credentials from browser tooling or attempt to expose the service through a proxy or LAN interface.

Configuration is user-scoped:

- macOS: `~/Library/Application Support/skillpin/config.json`
- Linux: `$XDG_CONFIG_HOME/skillpin/config.json`, or `~/.config/skillpin/config.json`
- Windows: `%APPDATA%\\skillpin\\config.json`

Project state is stored at `.agents/skillpin.json` in the selected project.
