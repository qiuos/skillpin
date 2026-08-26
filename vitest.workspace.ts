import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    include: ["packages/core/src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
