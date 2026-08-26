import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distributionDirectory = path.join(rootDirectory, "dist");
const cliEntry = path.join(rootDirectory, "packages", "cli", "src", "main.ts");
const webDirectory = path.join(rootDirectory, "packages", "web", "dist");
const packageJson = JSON.parse(
  await readFile(path.join(rootDirectory, "package.json"), "utf8"),
);

if (typeof packageJson.version !== "string") {
  throw new Error("The root package version is required for the CLI bundle.");
}
try {
  await stat(webDirectory);
} catch {
  throw new Error(
    "Build the Vite web application before building the distribution.",
  );
}

await rm(distributionDirectory, { force: true, recursive: true });
await mkdir(distributionDirectory, { recursive: true });
await build({
  configFile: false,
  define: {
    __SKILLPIN_VERSION__: JSON.stringify(packageJson.version),
  },
  publicDir: false,
  build: {
    emptyOutDir: false,
    minify: "oxc",
    outDir: distributionDirectory,
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        format: "es",
      },
    },
    sourcemap: false,
    ssr: cliEntry,
    target: "node22",
  },
  ssr: {
    noExternal: ["@skillpin/core", "yaml"],
  },
});
await cp(webDirectory, path.join(distributionDirectory, "web"), {
  recursive: true,
});

console.log("Built distributable runtime in dist/.");
