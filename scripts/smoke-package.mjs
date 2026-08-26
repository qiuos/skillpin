import { execFile, spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageManifest = JSON.parse(
  await readFile(path.join(rootDirectory, "package.json"), "utf8"),
);
if (typeof packageManifest.version !== "string") {
  throw new Error(
    "Package smoke verification requires a root package version.",
  );
}
const packageVersion = packageManifest.version;
const smokeDirectory = await mkdtemp(
  path.join(tmpdir(), "skillpin-package-smoke-"),
);
const npmCacheDirectory = path.join(smokeDirectory, "npm-cache");
const homeDirectory = path.join(smokeDirectory, "home");
const prefixDirectory = path.join(smokeDirectory, "prefix");
const gitPrefixDirectory = path.join(smokeDirectory, "git-prefix");
const projectDirectory = path.join(smokeDirectory, "project");
const configDirectory = path.join(smokeDirectory, "config");
const appDataDirectory = path.join(smokeDirectory, "appdata");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function npmCommand(arguments_) {
  if (process.platform === "win32") {
    if (process.env.npm_execpath === undefined) {
      throw new Error(
        "Windows package smoke verification requires npm_execpath.",
      );
    }
    return {
      arguments_: [process.env.npm_execpath, ...arguments_],
      command: process.execPath,
    };
  }
  return { arguments_, command: "npm" };
}

const environment = {
  ...process.env,
  APPDATA: appDataDirectory,
  HOME: homeDirectory,
  XDG_CONFIG_HOME: configDirectory,
  npm_config_cache: npmCacheDirectory,
};

async function runNpm(arguments_, options = {}) {
  const invocation = npmCommand(arguments_);
  return execFileAsync(invocation.command, invocation.arguments_, {
    cwd: rootDirectory,
    env: environment,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
}

function spawnNpm(arguments_) {
  const invocation = npmCommand(arguments_);
  return spawn(invocation.command, invocation.arguments_, {
    cwd: rootDirectory,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function requestLocal(base, pathname, options = {}) {
  const url = new URL(pathname, base);
  const body = options.body;
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        headers: {
          ...(body === undefined
            ? {}
            : { "Content-Length": String(Buffer.byteLength(body)) }),
          ...options.headers,
        },
        host: url.hostname,
        method: options.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        port: Number(url.port),
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            status: response.statusCode ?? 0,
          }),
        );
      },
    );
    request.once("error", reject);
    request.end(body);
  });
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error(
      "Unable to reserve a loopback port for package smoke verification.",
    );
  }
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function startSkillPin(prefix, port) {
  const process_ = spawnNpm([
    "exec",
    "--prefix",
    prefix,
    "--",
    "skillpin",
    "--no-open",
    "--port",
    String(port),
    projectDirectory,
  ]);
  let output = "";
  const collect = (chunk) => {
    output += chunk.toString("utf8");
  };
  process_.stdout.on("data", collect);
  process_.stderr.on("data", collect);

  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      process_.kill();
      reject(new Error(`Installed skillpin did not start in time:\n${output}`));
    }, 20_000);
    const inspect = () => {
      const match = output.match(
        /SkillPin local session: (http:\/\/127\.0\.0\.1:\d+)/,
      );
      if (match?.[1] !== undefined) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    };
    process_.stdout.on("data", inspect);
    process_.stderr.on("data", inspect);
    process_.once("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Installed skillpin exited before startup (${code}):\n${output}`,
        ),
      );
    });
  });
  return { address, output: () => output, process: process_ };
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Installed skillpin exited with ${code}.`));
      }
    });
  });
}

function userConfigPath() {
  if (process.platform === "darwin") {
    return path.join(
      homeDirectory,
      "Library",
      "Application Support",
      "skillpin",
      "config.json",
    );
  }
  if (process.platform === "win32") {
    return path.join(appDataDirectory, "skillpin", "config.json");
  }
  return path.join(configDirectory, "skillpin", "config.json");
}

async function writePreservedState() {
  const configPath = userConfigPath();
  const manifestPath = path.join(projectDirectory, ".agents", "skillpin.json");
  const config =
    '{"schemaVersion":1,"preferences":{"theme":"system"},"sources":[]}\n';
  const manifest = '{"schemaVersion":1,"revision":0,"managedSkills":[]}\n';
  await mkdir(path.dirname(configPath), { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(configPath, config);
  await writeFile(manifestPath, manifest);
  return { config, configPath, manifest, manifestPath };
}

async function createGitFixture() {
  const fixtureDirectory = path.join(smokeDirectory, "git-fixture");
  const excludedTopLevel = new Set([
    ".git",
    "artifacts",
    "coverage",
    "dist",
    "node_modules",
    "playwright-report",
    "test-results",
  ]);
  await cp(rootDirectory, fixtureDirectory, {
    filter: (source) => {
      const relative = path.relative(rootDirectory, source);
      const topLevel = relative.split(path.sep)[0];
      return relative === "" || !excludedTopLevel.has(topLevel);
    },
    recursive: true,
  });
  await execFileAsync("git", ["init", "--quiet"], { cwd: fixtureDirectory });
  await execFileAsync("git", ["add", "--all"], { cwd: fixtureDirectory });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=skillpin-smoke@example.invalid",
      "-c",
      "user.name=SkillPin package smoke",
      "commit",
      "--quiet",
      "-m",
      "package smoke fixture",
    ],
    { cwd: fixtureDirectory },
  );
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: fixtureDirectory,
  });
  return { commit: stdout.trim(), fixtureDirectory };
}

try {
  await Promise.all([
    mkdir(npmCacheDirectory, { recursive: true }),
    mkdir(homeDirectory, { recursive: true }),
    mkdir(projectDirectory, { recursive: true }),
  ]);
  const archives = (
    await readdir(path.join(rootDirectory, "artifacts"))
  ).filter((file) => file.endsWith(".tgz"));
  assert(
    archives.length === 1,
    "Run npm run pack before package smoke verification.",
  );
  const archivePath = path.join(rootDirectory, "artifacts", archives[0]);
  await access(archivePath);

  const state = await writePreservedState();
  await runNpm([
    "install",
    "--ignore-scripts",
    "--prefix",
    prefixDirectory,
    archivePath,
  ]);
  const version = await runNpm([
    "exec",
    "--prefix",
    prefixDirectory,
    "--",
    "skillpin",
    "--version",
  ]);
  assert(
    version.stdout.trim() === packageVersion,
    "Installed skillpin --version did not return the package version.",
  );
  const help = await runNpm([
    "exec",
    "--prefix",
    prefixDirectory,
    "--",
    "skillpin",
    "--help",
  ]);
  assert(
    help.stdout.includes("Usage: skillpin"),
    "Installed skillpin --help did not run.",
  );

  const port = await reservePort();
  const started = await startSkillPin(prefixDirectory, port);
  const page = await requestLocal(started.address, "/");
  assert(
    page.status === 200,
    "Installed skillpin did not serve its web entry.",
  );
  assert(
    page.body.includes('<div id="root"></div>'),
    "Installed skillpin served the legacy placeholder instead of the Vite application.",
  );
  assert(
    !page.body.includes("The SkillPin web interface will load here."),
    "Installed skillpin served the legacy placeholder.",
  );
  const cookie = Array.isArray(page.headers["set-cookie"])
    ? page.headers["set-cookie"][0]
    : page.headers["set-cookie"];
  assert(cookie !== undefined, "Web entry did not issue a bootstrap cookie.");
  const assetMatch = page.body.match(/(?:src|href)=["'](\/assets\/[^"']+)["']/);
  assert(
    assetMatch?.[1] !== undefined,
    "Web entry did not reference a bundled asset.",
  );
  const asset = await requestLocal(started.address, assetMatch[1]);
  assert(
    asset.status === 200,
    "Installed skillpin did not serve its bundled asset.",
  );
  assert(
    asset.headers["set-cookie"] === undefined,
    "Static assets must not issue bootstrap cookies.",
  );
  const bootstrap = await requestLocal(
    started.address,
    "/api/session/bootstrap",
    {
      headers: { Cookie: cookie.split(";")[0], Origin: started.address },
      method: "POST",
    },
  );
  assert(
    bootstrap.status === 200,
    "Bootstrap endpoint rejected the installed page cookie.",
  );
  const credential = JSON.parse(bootstrap.body).data?.credential;
  assert(
    typeof credential === "string",
    "Bootstrap response did not include a session credential.",
  );
  const shutdown = await requestLocal(
    started.address,
    "/api/session/shutdown",
    {
      headers: {
        Authorization: `Bearer ${credential}`,
        Origin: started.address,
      },
      method: "POST",
    },
  );
  assert(
    shutdown.status === 202,
    "Installed skillpin session did not shut down cleanly.",
  );
  await waitForExit(started.process);

  assert(
    (await readFile(state.configPath, "utf8")) === state.config,
    "Valid user configuration changed during installed startup.",
  );
  assert(
    (await readFile(state.manifestPath, "utf8")) === state.manifest,
    "Valid project manifest changed during installed startup.",
  );
  await runNpm([
    "uninstall",
    "--ignore-scripts",
    "--prefix",
    prefixDirectory,
    "skillpin",
  ]);
  await runNpm([
    "install",
    "--force",
    "--ignore-scripts",
    "--prefix",
    prefixDirectory,
    archivePath,
  ]);
  assert(
    (await readFile(state.configPath, "utf8")) === state.config,
    "Valid user configuration changed during reinstall.",
  );
  assert(
    (await readFile(state.manifestPath, "utf8")) === state.manifest,
    "Valid project manifest changed during reinstall.",
  );

  const futureConfig = '{"schemaVersion":999,"future":"retained"}\n';
  const futureManifest = '{"schemaVersion":999,"future":"retained"}\n';
  await writeFile(state.configPath, futureConfig);
  await writeFile(state.manifestPath, futureManifest);
  await runNpm([
    "install",
    "--force",
    "--ignore-scripts",
    "--prefix",
    prefixDirectory,
    archivePath,
  ]);
  assert(
    (await readFile(state.configPath, "utf8")) === futureConfig,
    "Future-schema user configuration was overwritten during reinstall.",
  );
  assert(
    (await readFile(state.manifestPath, "utf8")) === futureManifest,
    "Future-schema project manifest was overwritten during reinstall.",
  );
  await runNpm([
    "uninstall",
    "--ignore-scripts",
    "--prefix",
    prefixDirectory,
    "skillpin",
  ]);

  const fixture = await createGitFixture();
  await runNpm([
    "install",
    "--prefix",
    gitPrefixDirectory,
    `git+${pathToFileURL(fixture.fixtureDirectory).href}#${fixture.commit}`,
  ]);
  const gitVersion = await runNpm([
    "exec",
    "--prefix",
    gitPrefixDirectory,
    "--",
    "skillpin",
    "--version",
  ]);
  assert(
    gitVersion.stdout.trim() === packageVersion,
    "Immutable Git install did not provide skillpin.",
  );
  await runNpm(["uninstall", "--prefix", gitPrefixDirectory, "skillpin"]);

  console.log(
    "Package smoke verification passed (tarball, immutable Git commit, reinstall, and uninstall).",
  );
} finally {
  await rm(smokeDirectory, { force: true, recursive: true });
}
