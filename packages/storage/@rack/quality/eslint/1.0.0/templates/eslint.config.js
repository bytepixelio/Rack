import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'
import typescriptParser from '@typescript-eslint/parser'
import typescript from '@typescript-eslint/eslint-plugin'

export default [
  {
    ignores: ['**/dist/**', '**/types/**', '**/coverage/**', 'eslint.config.js']
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest'
      },
      globals: { ...globals.node }
    },
    plugins: {
      prettier,
      '@typescript-eslint': typescript
    },
    rules: {
      ...prettierConfig.rules,
      ...typescript.configs.recommended.rules,
      'no-undef': 'off',
      'prettier/prettier': 'error',
      'no-case-declarations': 'off',
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  }
]
