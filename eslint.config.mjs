import js from "@eslint/js"
import globals from "globals"
import { defineConfig } from "eslint/config"

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: {
      js
    },
    extends: [
      "js/recommended",
      "prettier"
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      },
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "indent": ["error", 2],
      "semi": ["error", "never"],
      "prefer-const": "error"
    }
  }
])
