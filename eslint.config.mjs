import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import-x";

export default defineConfig(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.mjs"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.tsx", "**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
      "@stylistic": stylistic,
      "import-x": importPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      curly: ["error", "all"],
      "no-case-declarations": "error",
      "padding-line-between-statements": ["error", { blankLine: "always", prev: "block-like", next: "*" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        {
          accessibility: "explicit",
          overrides: {
            constructors: "no-public",
          },
        },
      ],
      "@typescript-eslint/member-ordering": [
        "error",
        {
          default: [
            "public-static-field",
            "private-static-field",
            "public-instance-field",
            "private-instance-field",
            "constructor",
            "public-instance-method",
            "private-instance-method",
          ],
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: true,
        },
      ],
      "react-hooks/set-state-in-effect": ["off"],
      "react-hooks/refs": ["off"],
      "react-hooks/exhaustive-deps": "error",
      "@stylistic/multiline-comment-style": ["error", "separate-lines"],
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
    },
  },
  {
    files: ["**/vite.config.ts", "**/vitest.config.ts", "**/vitest.shared.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  }
);
