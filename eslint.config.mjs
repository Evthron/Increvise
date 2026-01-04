import js from '@eslint/js'
import { configs } from 'eslint-plugin-lit'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      semi: ['error', 'never'],
      quotes: ['warn', 'single'],
      indent: ['error', 2],
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**'],
  },
  configs['flat/recommended'],
]
