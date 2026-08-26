import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const cliOrWebImports = [
  "@skillpin/cli",
  "@skillpin/cli/*",
  "@skillpin/web",
  "@skillpin/web/*",
];

export default tseslint.config(
  {
    ignores: [
      "artifacts/",
      "coverage/",
      "**/dist/",
      "node_modules/",
      ".trellis/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      "import/resolver": {
        typescript: true,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "import/no-cycle": "error",
      "import/no-unresolved": ["error", { ignore: ["^@skillpin/core$"] }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["eslint.config.js"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        TextDecoder: "readonly",
        URL: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    files: ["scripts/build-distribution.mjs"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
  {
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: cliOrWebImports }],
    },
  },
  {
    files: ["packages/cli/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["@skillpin/web", "@skillpin/web/*"] },
      ],
    },
  },
  {
    files: ["packages/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["@skillpin/cli", "@skillpin/cli/*"] },
      ],
    },
  },
);
