import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import react from "eslint-plugin-react";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Ignore build output
  globalIgnores(["dist", "node_modules"]),

  // ── JS / JSX ──────────────────────────────────────────────────────────────
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // override — разрешить const-реэкспорты компонентов (Tabs = Primitive.Root и т.д.)
      {
        rules: { "react-refresh/only-export-components": ["warn", { allowConstantExport: true }] },
      },
    ],
    plugins: { react },
    settings: { react: { version: "detect" } },
    languageOptions: {
      ecmaVersion: "latest",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      // Переменные.
      // destructuredArrayIgnorePattern покрывает { icon: Icon } — Icon начинается с заглавной.
      // jsx-uses-vars говорит ESLint что <Icon /> — это использование переменной Icon.
      "no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^[A-Z_]",
          argsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // React
      "react/jsx-uses-vars": "error", // <Icon /> считается использованием Icon
      "react/jsx-uses-react": "off", // не нужен с new JSX transform
      "react/react-in-jsx-scope": "off",
      "react/jsx-no-target-blank": "error",
      "react/jsx-key": "error",
      "react/no-unknown-property": "error",
      "react/self-closing-comp": "warn",
    },
  },

  // ── TS / TSX ──────────────────────────────────────────────────────────────
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      react,
    },
    settings: { react: { version: "detect" } },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
        // project: true — раскомментируй если нужны type-aware правила (медленнее)
        // project: ["./tsconfig.json"],
      },
      globals: globals.browser,
    },
    rules: {
      // TS-специфичные
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^[A-Z_]",
          argsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // React Hooks
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React
      "react/jsx-key": "error",
      "react/no-unknown-property": "error",
      "react/self-closing-comp": "warn",

      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
]);
