import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const source = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@skillpin/core/catalog",
        replacement: source("./packages/core/src/catalog/index.ts"),
      },
      {
        find: "@skillpin/core/changes",
        replacement: source("./packages/core/src/changes/index.ts"),
      },
      {
        find: "@skillpin/core/persistence",
        replacement: source("./packages/core/src/persistence/index.ts"),
      },
      {
        find: "@skillpin/core/platform",
        replacement: source("./packages/core/src/platform/index.ts"),
      },
      {
        find: "@skillpin/core/project",
        replacement: source("./packages/core/src/project/index.ts"),
      },
      {
        find: "@skillpin/core",
        replacement: source("./packages/core/src/index.ts"),
      },
    ],
  },
  test: {
    name: "core",
    include: [
      "packages/core/src/**/*.test.ts",
      "packages/web/src/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
});
